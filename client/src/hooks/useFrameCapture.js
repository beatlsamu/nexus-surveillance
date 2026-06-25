// client/src/hooks/useFrameCapture.js
//
// Captura periódicamente un frame del <video> indicado, lo redimensiona en un
// canvas oculto y entrega un JPEG en base64 vía onFrame(base64, mimeType).
// No depende de WebRTC ni de getUserMedia — simplemente "fotografía" lo que
// ya se está renderizando en pantalla, así sirve tanto para el dashboard
// (stream remoto) como para cualquier otro <video> que se le pase.

import { useEffect, useRef } from 'react'

export function useFrameCapture({
  videoRef,
  enabled,
  intervalMs = 6000,
  maxWidth = 640,
  quality = 0.55,
  onFrame,
}) {
  const canvasRef = useRef(null)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  useEffect(() => {
    if (!enabled) {
      console.log('[IA-Narrador] captura desactivada (toggle IA en OFF, o aún sin stream de video)')
      return
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    const canvas = canvasRef.current

    const captureOnce = () => {
      const video = videoRef.current
      if (!video) {
        console.warn('[IA-Narrador] sin referencia al <video> todavía')
        return
      }
      if (video.readyState < 2 || !video.videoWidth) {
        console.warn(
          `[IA-Narrador] video no listo aún (readyState=${video.readyState}, videoWidth=${video.videoWidth}) — se reintentará en el próximo ciclo`
        )
        return // todavía no hay un frame decodificado disponible
      }

      const scale = Math.min(1, maxWidth / video.videoWidth)
      const w = Math.max(1, Math.round(video.videoWidth * scale))
      const h = Math.max(1, Math.round(video.videoHeight * scale))
      canvas.width = w
      canvas.height = h

      const ctx2d = canvas.getContext('2d')
      try {
        ctx2d.drawImage(video, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        const base64 = dataUrl.split(',')[1]
        if (base64 && onFrameRef.current) {
          console.log(
            `[IA-Narrador] frame capturado (${w}x${h}, ~${Math.round(base64.length / 1024)}KB) — enviando al servidor`
          )
          onFrameRef.current(base64, 'image/jpeg')
        }
      } catch (err) {
        // No debería pasar con streams locales (no hay problema de CORS/taint),
        // pero por si acaso no rompemos el ciclo de captura.
        console.error('[IA-Narrador] No se pudo capturar el frame:', err.message)
      }
    }

    console.log(`[IA-Narrador] captura activada (intervalo=${intervalMs}ms)`)

    // Primer frame casi inmediato para feedback rápido al conectar,
    // luego al ritmo configurado.
    const firstTimeout = setTimeout(captureOnce, 1500)
    const timer = setInterval(captureOnce, intervalMs)

    return () => {
      clearTimeout(firstTimeout)
      clearInterval(timer)
    }
  }, [enabled, intervalMs, maxWidth, quality, videoRef])
}
