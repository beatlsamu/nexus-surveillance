// server/ttsEngine.js
//
// Texto-a-voz usando edge-tts (el servicio gratuito de Microsoft Edge "Leer en
// voz alta"), vía el paquete Node `edge-tts-universal` — un puerto 1:1 del
// edge-tts de Python (rany2/edge-tts), sin necesidad de cuenta ni API key.
//
// IMPORTANTE — Licencia: `edge-tts-universal` es AGPL-3.0. Si el dashboard se
// expone como servicio en red a terceros, revisa las implicancias de AGPL
// para tu caso (obligación de publicar el código fuente del servidor). Si
// eso es un problema, la alternativa es llamar al `edge-tts` de Python (MIT)
// vía child_process — la interfaz de `synthesize()` de abajo se puede
// reemplazar sin tocar el resto del pipeline.
//
// Devuelve audio en MP3 + "cues" (marcas de tiempo por palabra) para que el
// cliente pueda sincronizar subtítulos con el audio.

const { Communicate, SubMaker } = require('edge-tts-universal')

const DEFAULT_VOICE = process.env.TTS_VOICE || 'es-CL-LorenzoNeural' // voz chilena masculina
const DEFAULT_RATE = process.env.TTS_RATE || '+0%'
const DEFAULT_VOLUME = process.env.TTS_VOLUME || '+0%'

/**
 * Sintetiza texto a voz.
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.voice]
 * @returns {Promise<{audioBase64: string, mime: string, cues: Array<{text:string, offsetMs:number, durationMs:number}>}>}
 */
async function synthesize(text, opts = {}) {
  const voice = opts.voice || DEFAULT_VOICE

  const communicate = new Communicate(text, {
    voice,
    rate: opts.rate || DEFAULT_RATE,
    volume: opts.volume || DEFAULT_VOLUME,
  })

  const audioChunks = []
  const cues = []
  // SubMaker no es estrictamente necesario para nuestro JSON de cues, pero lo
  // usamos también para poder loguear/exportar un .srt si se necesita debug.
  const subMaker = new SubMaker()

  for await (const chunk of communicate.stream()) {
    if (chunk.type === 'audio' && chunk.data) {
      audioChunks.push(chunk.data)
    } else if (chunk.type === 'WordBoundary') {
      subMaker.feed(chunk)
      cues.push({
        text: chunk.text,
        // offset/duration vienen en unidades de 100ns (ticks) — pasamos a ms
        offsetMs: Math.round(chunk.offset / 10000),
        durationMs: Math.round(chunk.duration / 10000),
      })
    }
  }

  if (!audioChunks.length) {
    throw new Error('[TTS] edge-tts no devolvió audio (posible bloqueo del servicio o texto vacío)')
  }

  const audioBuffer = Buffer.concat(audioChunks)
  return {
    audioBase64: audioBuffer.toString('base64'),
    mime: 'audio/mpeg',
    cues,
    voice,
  }
}

module.exports = { synthesize, DEFAULT_VOICE }
