import React, { useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useMobileStream, STATUS } from '../hooks/useMobileStream.js'

const STATUS_CONFIG = {
  [STATUS.INITIALIZING]: {
    label: 'INITIALIZING',
    color: '#4a7090',
    icon: '◌',
    description: 'Setting up camera...',
  },
  [STATUS.CAMERA_READY]: {
    label: 'CAMERA READY',
    color: '#00c8ff',
    icon: '◎',
    description: 'Connecting to dashboard...',
  },
  [STATUS.CONNECTING]: {
    label: 'CONNECTING',
    color: '#0066ff',
    icon: '◑',
    description: 'Establishing WebRTC link...',
  },
  [STATUS.STREAMING]: {
    label: 'STREAMING',
    color: '#00ff88',
    icon: '●',
    description: 'Live on dashboard',
  },
  [STATUS.RECONNECTING]: {
    label: 'RECONNECTING',
    color: '#ff9900',
    icon: '◐',
    description: 'Re-establishing connection...',
  },
  [STATUS.OFFLINE]: {
    label: 'OFFLINE',
    color: '#ff3366',
    icon: '○',
    description: 'No server connection',
  },
  [STATUS.ERROR]: {
    label: 'ERROR',
    color: '#ff3366',
    icon: '✕',
    description: 'Check camera permissions',
  },
}

export default function MobileCamera() {
  const [searchParams] = useSearchParams()
  const roomId = searchParams.get('room')
  const videoRef = useRef(null)

  const { status, error, deviceName, facingMode, toggleCamera } =
    useMobileStream(roomId, videoRef)

  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG[STATUS.ERROR]
  const isStreaming = status === STATUS.STREAMING

  // WakeLock to prevent screen sleep
  useEffect(() => {
    let wakeLock = null
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen')
        }
      } catch (e) {
        // WakeLock not supported or denied — ignore
      }
    }

    requestWakeLock()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (wakeLock) wakeLock.release().catch(() => {})
    }
  }, [])

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#050810',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Camera preview (background) */}
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
          opacity: 0.85,
        }}
      />

      {/* Dark overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, rgba(5,8,16,0.7) 0%, rgba(5,8,16,0.3) 40%, rgba(5,8,16,0.3) 60%, rgba(5,8,16,0.85) 100%)',
          zIndex: 1,
        }}
      />

      {/* Grid pattern overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(0,200,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,255,0.03) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '100%',
          padding: '48px 24px 40px',
        }}
      >
        {/* Top: System name */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontFamily: '"Orbitron", monospace',
              fontSize: 11,
              letterSpacing: '0.4em',
              color: 'rgba(0,200,255,0.5)',
              marginBottom: 4,
            }}
          >
            NEXUS SURVEILLANCE
          </div>
          <div
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              color: 'rgba(74,112,144,0.8)',
              letterSpacing: '0.1em',
            }}
          >
            {deviceName}
          </div>
        </div>

        {/* Center: Status indicator */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {/* Animated ring */}
          <div style={{ position: 'relative', width: 96, height: 96 }}>
            {/* Background circle */}
            <svg viewBox="0 0 96 96" style={{ position: 'absolute', inset: 0 }}>
              <circle cx="48" cy="48" r="44" fill="none" stroke="rgba(0,200,255,0.1)" strokeWidth="1" />
            </svg>

            {/* Rotating indicator */}
            <AnimatePresence mode="wait">
              <motion.svg
                key={status}
                viewBox="0 0 96 96"
                style={{ position: 'absolute', inset: 0 }}
                animate={
                  status === STATUS.STREAMING
                    ? { rotate: 0 }
                    : { rotate: 360 }
                }
                transition={
                  status === STATUS.STREAMING
                    ? { duration: 0 }
                    : { duration: 2, repeat: Infinity, ease: 'linear' }
                }
              >
                <circle
                  cx="48" cy="48" r="44"
                  fill="none"
                  stroke={cfg.color}
                  strokeWidth="2"
                  strokeDasharray={status === STATUS.STREAMING ? '276' : '60 216'}
                  strokeLinecap="round"
                  opacity={status === STATUS.STREAMING ? 0.8 : 1}
                />
              </motion.svg>
            </AnimatePresence>

            {/* Center icon */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                color: cfg.color,
                fontFamily: '"JetBrains Mono", monospace',
              }}
            >
              <motion.span
                key={status}
                animate={
                  status === STATUS.STREAMING
                    ? { scale: [1, 1.15, 1], opacity: [1, 0.8, 1] }
                    : {}
                }
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                {cfg.icon}
              </motion.span>
            </div>
          </div>

          {/* Status label */}
          <div>
            <motion.div
              key={status}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                fontFamily: '"Orbitron", monospace',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: cfg.color,
                textShadow: `0 0 20px ${cfg.color}66`,
                marginBottom: 6,
              }}
            >
              {cfg.label}
            </motion.div>
            <div
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                color: 'rgba(74,112,144,0.9)',
                letterSpacing: '0.05em',
              }}
            >
              {error || cfg.description}
            </div>
          </div>

          {/* Error help text */}
          {status === STATUS.ERROR && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                background: 'rgba(255,51,102,0.08)',
                border: '1px solid rgba(255,51,102,0.2)',
                borderRadius: 8,
                padding: '12px 16px',
                maxWidth: 280,
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 10,
                color: 'rgba(255,51,102,0.9)',
                lineHeight: 1.6,
                textAlign: 'center',
              }}
            >
              {error?.includes('permission') || error?.includes('denied') ? (
                <>
                  Camera access denied.<br />
                  Go to <strong>Settings → Safari → Camera</strong><br />
                  and allow access, then reload.
                </>
              ) : (
                <>
                  {error}<br />
                  Please refresh the page.
                </>
              )}
            </motion.div>
          )}

          {/* Room info */}
          {roomId && (
            <div
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 9,
                color: 'rgba(0,200,255,0.3)',
                letterSpacing: '0.15em',
              }}
            >
              ROOM · {roomId.toUpperCase()}
            </div>
          )}
        </div>

        {/* Bottom: Toggle camera button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleCamera}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: 'rgba(0,200,255,0.08)',
            border: '1px solid rgba(0,200,255,0.25)',
            borderRadius: 8,
            color: '#00c8ff',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10,
            letterSpacing: '0.2em',
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          {facingMode === 'environment' ? 'FRONT CAMERA' : 'BACK CAMERA'}
        </motion.button>
      </div>
    </div>
  )
}
