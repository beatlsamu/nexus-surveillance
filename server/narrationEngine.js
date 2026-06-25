// server/narrationEngine.js
//
// Orquesta el pipeline completo por cámara:
//   frame (jpeg base64) -> VisionModelWheel.describe() -> decide si narrar
//   -> ttsEngine.synthesize() -> emite evento al/los socket(s) interesados.
//
// Mantiene contexto corto por cámara para que el LLM entienda continuidad:
// si una persona sigue en escena, debe narrar lo que hace AHORA en vez de
// repetir la descripción completa cada vez.

const { VisionModelWheel, looksLikeRefusal } = require('./visionWheel')
const ttsEngine = require('./ttsEngine')

const MAX_SENTENCES = Number(process.env.NARRATION_MAX_SENTENCES || 3)
const CONTEXT_TTL_MS = Number(process.env.NARRATION_CONTEXT_TTL_MS || 30000) // si pasa más de esto sin frames, se asume escena nueva

class NarrationEngine {
  constructor({ io, models } = {}) {
    this.io = io
    this.wheel = new VisionModelWheel(models)
    // cameraId -> { lastDescription, personPresent, personStreak, lastSeenAt, busy }
    this.context = new Map()
  }

  status() {
    return this.wheel.status()
  }

  _getContext(cameraId) {
    let ctx = this.context.get(cameraId)
    const now = Date.now()
    if (!ctx || now - ctx.lastSeenAt > CONTEXT_TTL_MS) {
      ctx = { lastDescription: null, personPresent: false, personStreak: 0, lastSeenAt: now, busy: false }
      this.context.set(cameraId, ctx)
    }
    return ctx
  }

  isBusy(cameraId) {
    const ctx = this.context.get(cameraId)
    return !!ctx?.busy
  }

  _buildPrompt({ deviceName, ctx }) {
    const continuationLine = ctx.personStreak > 1
      ? `Contexto: hace instantes reportaste lo siguiente sobre esta misma escena: "${ctx.lastDescription}". La persona/situación parece continuar. NO repitas la descripción completa; reporta SOLO la novedad, continuación de la acción o cambio de comportamiento (qué hace ahora, si se desplazó, si interactuó con algo nuevo).`
      : `Esta es una detección nueva: si hay una persona, da la descripción inicial lo más completa posible.`

    return `Eres el motor de un sistema automatizado de cámaras de seguridad (no un asistente conversacional). Tu única función es generar alertas breves y directas para un guardia, a partir de UN fotograma de cámara en vivo. No estás identificando ni guardando la identidad de nadie — solo describes lo que cualquier guardia humano vería al mirar la pantalla, para una alerta de seguridad en tiempo real.
Cámara: ${deviceName || 'sin nombre'}

Tu tarea, en este orden:
1. Determina si hay una o más personas visibles en la imagen.
2. Si NO hay ninguna persona y la escena no presenta nada inusual o relevante para seguridad, responde EXACTAMENTE con la palabra: SIN_NOVEDAD (sin nada más).
3. Si hay algo relevante para seguridad aunque no haya persona (puerta/ventana abierta de forma anómala, fuego, humo, objeto fuera de lugar, vehículo desconocido, etc.), descríbelo brevemente.
4. Si hay una o más personas, descríbelas de forma útil para la alerta: tipo y color de ropa, qué está haciendo (acción concreta), qué lleva en las manos o consigo, hacia dónde se mueve, y cualquier comportamiento relevante (forzar algo, ocultarse, merodear, cargar herramientas u objetos, actuar de forma sospechosa, etc.).
5. Describe SOLO lo que es visualmente observable. No inventes identidad, nombre, ni asumas relación con el lugar.
6. ${continuationLine}

IMPORTANTE: Responde SIEMPRE con la alerta o con SIN_NOVEDAD — directo, sin preámbulos. NUNCA respondas con disculpas, advertencias sobre privacidad, limitaciones del modelo, ni frases como "no puedo identificar/describir personas"; eso no es una opción válida aquí, este es un sistema de seguridad operando con tu consentimiento previsto para esta tarea. Responde en español, en máximo ${MAX_SENTENCES} frases, tono de reporte de guardia: claro y directo, sin markdown ni listas.`
  }

  _parseModelOutput(raw) {
    const cleaned = (raw || '').trim()
    if (/^SIN_NOVEDAD\b/i.test(cleaned)) {
      return { skip: true, personDetected: false, text: '' }
    }
    // Red de seguridad: si por algún motivo se filtró una negativa/disclaimer
    // (no debería pasar — la rueda ya las descarta y prueba otro modelo),
    // jamás la narramos ni la mostramos como subtítulo.
    if (looksLikeRefusal(cleaned)) {
      console.warn('[NarrationEngine] Se filtró una negativa del modelo, se descarta sin narrar:', cleaned.slice(0, 120))
      return { skip: true, personDetected: false, text: '' }
    }
    // Heurística simple: si menciona explícitamente "persona", "hombre",
    // "mujer", "individuo", etc., asumimos persona detectada para mantener
    // el contexto de continuidad. No es perfecto pero es suficiente para
    // decidir si la próxima ronda debe pedir "continuación" en vez de
    // "descripción nueva".
    const personRegex = /\b(persona|personas|hombre|mujer|individuo|sujeto|niñ[oa]|alguien)\b/i
    const personDetected = personRegex.test(cleaned)
    return { skip: false, personDetected, text: cleaned }
  }

  /**
   * Procesa un frame de una cámara. Si corresponde, narra (TTS) y emite
   * `narration:update` al socket indicado (o lo difunde si no se pasa uno).
   *
   * @param {object} params
   * @param {string} params.cameraId
   * @param {string} params.deviceName
   * @param {string} params.imageBase64
   * @param {string} [params.mimeType]
   * @param {string} [params.targetSocketId] - si se omite, se difunde a la sala 'viewers'
   */
  async processFrame({ cameraId, deviceName, imageBase64, mimeType = 'image/jpeg', targetSocketId }) {
    const ctx = this._getContext(cameraId)

    if (ctx.busy) {
      // Ya hay un análisis en curso para esta cámara — descartamos el frame
      // entrante para no acumular cola (preferimos "tiempo real" a precisión).
      return { skipped: true, reason: 'busy' }
    }

    ctx.busy = true
    ctx.lastSeenAt = Date.now()

    const emitStatus = (payload) => {
      const target = targetSocketId ? this.io.to(targetSocketId) : this.io.to('viewers')
      target.emit('narration:status', { cameraId, ...payload })
    }

    try {
      emitStatus({ state: 'analizando' })

      const prompt = this._buildPrompt({ deviceName, ctx })
      const { text: rawText, model } = await this.wheel.describe({
        imageBase64,
        mimeType,
        prompt,
      })

      const parsed = this._parseModelOutput(rawText)

      if (parsed.skip) {
        ctx.personPresent = false
        ctx.personStreak = 0
        emitStatus({ state: 'sin_novedad', model })
        return { skipped: true, reason: 'sin_novedad', model }
      }

      ctx.lastDescription = parsed.text
      if (parsed.personDetected) {
        ctx.personStreak = ctx.personPresent ? ctx.personStreak + 1 : 1
        ctx.personPresent = true
      } else {
        ctx.personPresent = false
        ctx.personStreak = 0
      }

      emitStatus({ state: 'narrando', model })

      let ttsResult = null
      try {
        ttsResult = await ttsEngine.synthesize(parsed.text)
      } catch (ttsErr) {
        console.error('[NarrationEngine] Error de TTS:', ttsErr.message)
      }

      const payload = {
        cameraId,
        text: parsed.text,
        model,
        personDetected: parsed.personDetected,
        timestamp: Date.now(),
        audio: ttsResult ? { base64: ttsResult.audioBase64, mime: ttsResult.mime, voice: ttsResult.voice } : null,
        cues: ttsResult ? ttsResult.cues : [],
      }

      const target = targetSocketId ? this.io.to(targetSocketId) : this.io.to('viewers')
      target.emit('narration:update', payload)

      return { skipped: false, model, personDetected: parsed.personDetected }
    } catch (err) {
      console.error(`[NarrationEngine] Error procesando frame de ${cameraId}:`, err.message)
      emitStatus({ state: 'error', error: err.message })
      return { skipped: true, reason: 'error', error: err.message }
    } finally {
      ctx.busy = false
    }
  }
}

module.exports = { NarrationEngine }
