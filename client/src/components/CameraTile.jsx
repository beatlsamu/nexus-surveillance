import React, { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { socket } from '../socket.js'
import { useNarrationSettings } from '../context/NarrationContext.jsx'
import { useFrameCapture } from '../hooks/useFrameCapture.js'
import { useNarration } from '../hooks/useNarration.js'
import SubtitleOverlay from './SubtitleOverlay.jsx'

function SignalBars({ strength = 3 }) {
  return (
    <div className="flex items-end gap-0.5" style={{ height: 12 }}>
      {[1, 2, 3, 4].map((level) => (
        <div
          key={level}
          style={{
            width: 3,
            height: 3 + level * 2,
            borderRadius: 1,
            background: level <= strength ? '#00c8ff' : 'rgba(0,200,255,0.15)',
            transition: 'background 0.3s',
          }}
        />
      ))}
    </div>
  )
}

export default function CameraTile({ cameraId, deviceName, stream }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const [time, setTime] = useState(new Date())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [latency] = useState(() => Math.floor(20 + Math.random() * 40))
  const [signalStrength] = useState(() => Math.floor(2 + Math.random() * 2))

  // ── Narrador de Seguridad IA ──────────────────────────────────────────
  const { enabled: aiEnabled, intervalMs, activeAudioCameraId, setActiveAudioCameraId } = useNarrationSettings()
  const hasMic = activeAudioCameraId === cameraId

  const handleFrame = useCallback(
    (base64, mimeType) => {
      socket.emit('vision:frame', { cameraId, deviceName, image: base64, mimeType })
    },
    [cameraId, deviceName]
  )

  useFrameCapture({
    videoRef,
    enabled: aiEnabled && !!stream,
    intervalMs,
    onFrame: handleFrame,
  })

  const { subtitle, state: narrationState, model, personDetected } = useNarration({
    cameraId,
    audioEnabled: hasMic,
  })

  const toggleMic = useCallback(() => {
    setActiveAudioCameraId(hasMic ? null : cameraId)
  }, [hasMic, cameraId, setActiveAudioCameraId])
  // ───────────────────────────────────────────────────────────────────────

  // Attach stream to video element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = null   // reset first — forces re-negotiation on Android 16
      videoRef.current.srcObject = stream
      videoRef.current.load()
      videoRef.current.play().catch(() => {})
    }
  }, [stream])

  // Real-time clock
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Fullscreen change listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(() => {})
    } else {
      await document.exitFullscreen().catch(() => {})
    }
  }, [])

  const pad = (n) => String(n).padStart(2, '0')
  const timeStr = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`
  const dateStr = `${time.getFullYear()}.${pad(time.getMonth() + 1)}.${pad(time.getDate())}`

  return (
    <motion.div
      ref={containerRef}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', damping: 20, stiffness: 200 }}
      className="relative overflow-hidden group"
      style={{
        background: '#050810',
        border: '1px solid rgba(0,200,255,0.2)',
        boxShadow: '0 0 20px rgba(0,200,255,0.15), inset 0 0 20px rgba(0,200,255,0.03)',
        borderRadius: 4,
        aspectRatio: '16/9',
        width: '100%',
      }}
    >
      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />

      {/* Scan line effect */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* Top overlay: device name + status */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-2.5 py-1.5 z-10"
        style={{
          background: 'linear-gradient(to bottom, rgba(5,8,16,0.9), transparent)',
        }}
      >
        <div className="flex items-center gap-2">
          <div className="pulse-dot" style={{ width: 6, height: 6 }} />
          <span
            className="font-mono text-[10px] font-semibold tracking-wider"
            style={{ color: '#e0f0ff' }}
          >
            {deviceName || cameraId}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SignalBars strength={signalStrength} />
          <span
            className="font-mono text-[9px] px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(0,255,136,0.15)',
              color: '#00ff88',
              border: '1px solid rgba(0,255,136,0.3)',
            }}
          >
            LIVE
          </span>
        </div>
      </div>

      {/* Bottom overlay: timestamp + latency + fullscreen */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2.5 py-1.5 z-10"
        style={{
          background: 'linear-gradient(to top, rgba(5,8,16,0.9), transparent)',
        }}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-[9px]" style={{ color: '#4a7090' }}>
            {dateStr}
          </span>
          <span className="font-mono text-[10px] font-semibold" style={{ color: '#e0f0ff' }}>
            {timeStr}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[9px]" style={{ color: '#00c8ff' }}>
            {latency}ms
          </span>
          {/* Narrador IA: tomar/soltar el "micrófono" de esta cámara */}
          {aiEnabled && (
            <button
              onClick={toggleMic}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                background: hasMic ? 'rgba(0,255,136,0.12)' : 'rgba(0,200,255,0.1)',
                border: `1px solid ${hasMic ? 'rgba(0,255,136,0.4)' : 'rgba(0,200,255,0.3)'}`,
                borderRadius: 3,
                padding: '2px 4px',
                cursor: 'pointer',
                color: hasMic ? '#00ff88' : '#00c8ff',
              }}
              title={hasMic ? 'Silenciar narración de esta cámara' : 'Activar narración con voz en esta cámara'}
            >
              {hasMic ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
                  <path d="M19 11a7 7 0 0 1-14 0M12 18v3" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-5.94-.6M9 9v2a3 3 0 0 0 4.2 2.75" />
                  <path d="M19 11a7 7 0 0 1-7 7c-.7 0-1.37-.1-2-.3M5 11a7 7 0 0 0 .34 2.16M12 18v3" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
              )}
            </button>
          )}
          {/* Fullscreen button */}
          <button
            onClick={toggleFullscreen}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              background: 'rgba(0,200,255,0.1)',
              border: '1px solid rgba(0,200,255,0.3)',
              borderRadius: 3,
              padding: '2px 4px',
              cursor: 'pointer',
              color: '#00c8ff',
            }}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="10" y1="14" x2="3" y2="21" />
                <line x1="21" y1="3" x2="14" y2="10" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Narrador de Seguridad IA: badge de estado + subtítulos */}
      {aiEnabled && (
        <SubtitleOverlay
          subtitle={subtitle}
          state={narrationState}
          personDetected={personDetected}
          model={model}
          hasMic={hasMic}
        />
      )}

      {/* Camera ID badge */}
      <div
        className="absolute top-8 left-2.5 z-10 opacity-40"
        style={{ pointerEvents: 'none' }}
      >
        <span className="font-mono text-[8px]" style={{ color: '#4a7090' }}>
          ID:{cameraId}
        </span>
      </div>

      {/* Corner accents */}
      {[
        { top: 0, left: 0, borderRight: 'none', borderBottom: 'none' },
        { top: 0, right: 0, borderLeft: 'none', borderBottom: 'none' },
        { bottom: 0, left: 0, borderRight: 'none', borderTop: 'none' },
        { bottom: 0, right: 0, borderLeft: 'none', borderTop: 'none' },
      ].map((style, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 10, height: 10,
            borderTop: '1.5px solid rgba(0,200,255,0.5)',
            borderLeft: '1.5px solid rgba(0,200,255,0.5)',
            ...style,
            zIndex: 5,
          }}
        />
      ))}
    </motion.div>
  )
}
