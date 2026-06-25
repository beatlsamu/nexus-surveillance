// server/visionWheel.js
//
// Rueda ("wheel") de modelos de visión de NVIDIA NIM con fallback automático.
// Si un modelo falla (timeout, error HTTP, respuesta vacía, rate-limit, etc.)
// se intenta el siguiente modelo de la lista, hasta agotarla.
//
// Formato de imagen: usamos el formato estándar tipo OpenAI que NIM soporta
// para VLMs — content: [{type:'text',...}, {type:'image_url', image_url:{url:'data:...'}}]
// Esto funciona tanto contra el endpoint cloud (integrate.api.nvidia.com)
// como contra un NIM autohospedado (docker) que expone /v1/chat/completions.

const NIM_BASE_URL = (process.env.NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '')
const NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY || process.env.NIM_API_KEY || process.env.NVIDIA_API_KEY

// Rueda por defecto — en el orden sugerido por Sam. Se puede sobreescribir
// con la variable de entorno VISION_MODEL_WHEEL (separada por comas).
const DEFAULT_WHEEL = [
  'meta/llama-3.2-90b-vision-instruct',
  'meta/llama-3.2-11b-vision-instruct',
  'nvidia/nemotron-nano-12b-v2-vl',
  'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
]

function parseWheelFromEnv() {
  const raw = process.env.VISION_MODEL_WHEEL
  if (!raw) return DEFAULT_WHEEL.slice()
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean)
  return list.length ? list : DEFAULT_WHEEL.slice()
}

// Heurística para detectar cuando un modelo respondió con una negativa o
// disclaimer ("no puedo identificar personas...", "as an AI...") en vez de
// hacer el reporte de seguridad pedido. Si pasa esto, NO queremos narrarlo
// ni mostrarlo como subtítulo — tratamos la respuesta como un fallo y
// probamos el siguiente modelo de la rueda.
const REFUSAL_PATTERNS = [
  /no puedo (describir|identificar|determinar|proporcionar|generar|mostrar|analizar)/i,
  /no estoy (en condiciones|autorizad[oa]|capacitad[oa]) (de|para)/i,
  /no tengo la capacidad/i,
  /lo siento,? (pero )?no puedo/i,
  /como (modelo|ia|asistente|sistema) de (ia|inteligencia artificial)/i,
  /por (motivos|razones) de privacidad/i,
  /privacidad de (las personas|los individuos|terceros)/i,
  /i('m| am) (not able|unable) to/i,
  /i cannot (describe|identify|provide|analyze)/i,
  /i'm sorry,? (but )?i can(not|'t)/i,
  /as an ai\b/i,
]

function looksLikeRefusal(text) {
  return REFUSAL_PATTERNS.some((rx) => rx.test(text))
}

class VisionModelWheel {
  constructor(models = parseWheelFromEnv()) {
    if (!models.length) throw new Error('VisionModelWheel: la lista de modelos está vacía')
    this.models = models
    this.cursor = 0 // rota el punto de partida en cada llamada para repartir la carga
    this.lastGoodModel = null
    this.failureCounts = new Map(models.map((m) => [m, 0]))
  }

  status() {
    return {
      wheel: this.models,
      lastGoodModel: this.lastGoodModel,
      failureCounts: Object.fromEntries(this.failureCounts),
    }
  }

  _nextStartIndex() {
    const idx = this.cursor
    this.cursor = (this.cursor + 1) % this.models.length
    return idx
  }

  /**
   * Pide una descripción de la imagen, probando modelos de la rueda en orden
   * hasta que uno responda correctamente.
   *
   * @param {object} opts
   * @param {string} opts.imageBase64  - imagen en base64 (sin el prefijo data:...)
   * @param {string} [opts.mimeType]   - image/jpeg | image/png
   * @param {string} opts.prompt       - instrucción de texto para el modelo
   * @param {number} [opts.maxTokens]
   * @param {number} [opts.timeoutMs]
   * @returns {Promise<{text: string, model: string, attempts: Array}>}
   */
  async describe({ imageBase64, mimeType = 'image/jpeg', prompt, maxTokens = 350, timeoutMs = 20000 }) {
    if (!NIM_API_KEY) {
      throw new Error(
        '[VisionWheel] Falta NVIDIA_NIM_API_KEY en el entorno (formato nvapi-...)'
      )
    }

    const start = this._nextStartIndex()
    const attempts = []
    let lastError = null

    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[(start + i) % this.models.length]
      const attemptStart = Date.now()
      try {
        const text = await this._callModel({ model, imageBase64, mimeType, prompt, maxTokens, timeoutMs })
        attempts.push({ model, ok: true, ms: Date.now() - attemptStart })

        if (text && looksLikeRefusal(text)) {
          attempts[attempts.length - 1].ok = false
          attempts[attempts.length - 1].error = 'negativa/disclaimer del modelo'
          this.failureCounts.set(model, (this.failureCounts.get(model) || 0) + 1)
          lastError = new Error(`${model} respondió con una negativa en vez de analizar la imagen`)
          console.warn(`[VisionWheel] ${model} devolvió una negativa — probando siguiente modelo de la rueda`)
          continue
        }

        if (text && text.trim()) {
          this.lastGoodModel = model
          return { text: text.trim(), model, attempts }
        }
        lastError = new Error(`Respuesta vacía de ${model}`)
        attempts[attempts.length - 1].ok = false
        attempts[attempts.length - 1].error = 'respuesta vacía'
      } catch (err) {
        lastError = err
        attempts.push({ model, ok: false, ms: Date.now() - attemptStart, error: err.message })
        this.failureCounts.set(model, (this.failureCounts.get(model) || 0) + 1)
        console.warn(`[VisionWheel] ${model} falló: ${err.message} — probando siguiente modelo de la rueda`)
      }
    }

    throw new Error(
      `[VisionWheel] Todos los modelos de la rueda fallaron. Último error: ${lastError?.message || 'desconocido'}`
    )
  }

  async _callModel({ model, imageBase64, mimeType, prompt, maxTokens, timeoutMs }) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${NIM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${NIM_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
              ],
            },
          ],
          max_tokens: maxTokens,
          temperature: 0.4,
          top_p: 0.9,
          stream: false,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 200)}`)
      }

      const data = await res.json()
      return data?.choices?.[0]?.message?.content || ''
    } finally {
      clearTimeout(timer)
    }
  }
}

module.exports = { VisionModelWheel, DEFAULT_WHEEL, looksLikeRefusal }
