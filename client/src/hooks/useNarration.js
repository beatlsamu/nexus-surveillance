// client/src/hooks/useNarration.js
//
// Escucha los eventos `narration:update` / `narration:status` del socket
// para UNA cámara específica, encola las narraciones (para que nunca se
// superpongan dos audios de la misma cámara) y expone el subtítulo/estado
// actual para que el componente lo renderice.

import { useEffect, useRef, useState, useCallback } from 'react'
import { socket } from '../socket.js'

function base64ToBlob(base64, mime) {
  const byteChars = atob(base64)
  const bytes = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i)
  return new Blob([bytes], { type: mime || 'audio/mpeg' })
}

export function useNarration({ cameraId, audioEnabled }) {
  const [subtitle, setSubtitle] = useState(null)
  const [state, setState] = useState('idle') // idle | analizando | narrando | sin_novedad | error
  const [model, setModel] = useState(null)
  const [personDetected, setPersonDetected] = useState(false)

  const queueRef = useRef([])
  const playingRef = useRef(false)
  const audioElRef = useRef(null)
  const subtitleTimeoutRef = useRef(null)
  const audioEnabledRef = useRef(audioEnabled)
  audioEnabledRef.current = audioEnabled

  const playNext = useCallback(() => {
    if (playingRef.current) return
    const next = queueRef.current.shift()
    if (!next) return
    playingRef.current = true

    setSubtitle(next.text)
    setModel(next.model)
    setPersonDetected(!!next.personDetected)

    const finishItem = (subtitleHoldMs) => {
      clearTimeout(subtitleTimeoutRef.current)
      subtitleTimeoutRef.current = setTimeout(() => setSubtitle(null), subtitleHoldMs)
      playingRef.current = false
      playNext()
    }

    if (next.audio?.base64 && audioEnabledRef.current) {
      try {
        const blob = base64ToBlob(next.audio.base64, next.audio.mime)
        const url = URL.createObjectURL(blob)
        const audioEl = new Audio(url)
        audioElRef.current = audioEl

        const cleanup = () => {
          URL.revokeObjectURL(url)
          // Margen extra tras terminar de hablar, para que el subtítulo
          // alcance a leerse cómodo aunque el audio ya haya terminado.
          finishItem(1800)
        }
        audioEl.addEventListener('ended', cleanup, { once: true })
        audioEl.addEventListener('error', cleanup, { once: true })
        audioEl.play().catch(cleanup)
        return
      } catch (err) {
        console.warn('[useNarration] No se pudo reproducir el audio:', err.message)
      }
    }

    // Sin audio (TTS falló, o esta cámara no tiene el "micrófono" en este
    // momento): igual mostramos el subtítulo, con tiempo de sobra para leerlo.
    const readMs = Math.min(12000, Math.max(4000, (next.text?.length || 20) * 90))
    const t = setTimeout(() => finishItem(1200), readMs)
    audioElRef.current = { pause: () => clearTimeout(t) } // por si se desmonta a mitad de camino
  }, [])

  useEffect(() => {
    const onUpdate = (payload) => {
      if (payload.cameraId !== cameraId) return
      queueRef.current.push(payload)
      playNext()
    }
    const onStatus = (payload) => {
      if (payload.cameraId !== cameraId) return
      setState(payload.state)
      if (payload.model) setModel(payload.model)
    }

    socket.on('narration:update', onUpdate)
    socket.on('narration:status', onStatus)

    return () => {
      socket.off('narration:update', onUpdate)
      socket.off('narration:status', onStatus)
      if (audioElRef.current?.pause) {
        try { audioElRef.current.pause() } catch (_) {}
      }
      clearTimeout(subtitleTimeoutRef.current)
      queueRef.current = []
      playingRef.current = false
    }
  }, [cameraId, playNext])

  return { subtitle, state, model, personDetected }
}
