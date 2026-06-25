import React, { useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CameraTile from './CameraTile.jsx'
import { useNarrationSettings } from '../context/NarrationContext.jsx'

function getGridColumns(count) {
  if (count <= 1) return 1
  if (count === 2) return 2
  if (count === 3) return 3
  if (count === 4) return 2
  if (count <= 6) return 3
  if (count <= 9) return 3
  if (count <= 12) return 4
  if (count <= 16) return 4
  return 5
}

function WaitingScreen() {
  return (
    <div
      className="flex flex-col items-center justify-center w-full h-full"
      style={{ minHeight: 300 }}
    >
      {/* Animated scan ring */}
      <div className="relative w-32 h-32 mb-8">
        {/* Static ring */}
        <svg
          viewBox="0 0 128 128"
          style={{ position: 'absolute', inset: 0 }}
        >
          <circle
            cx="64" cy="64" r="58"
            fill="none"
            stroke="rgba(0,200,255,0.1)"
            strokeWidth="1"
          />
          <circle
            cx="64" cy="64" r="44"
            fill="none"
            stroke="rgba(0,200,255,0.06)"
            strokeWidth="1"
          />
          {/* Cross hairs */}
          <line x1="64" y1="0" x2="64" y2="20" stroke="rgba(0,200,255,0.3)" strokeWidth="1" />
          <line x1="64" y1="108" x2="64" y2="128" stroke="rgba(0,200,255,0.3)" strokeWidth="1" />
          <line x1="0" y1="64" x2="20" y2="64" stroke="rgba(0,200,255,0.3)" strokeWidth="1" />
          <line x1="108" y1="64" x2="128" y2="64" stroke="rgba(0,200,255,0.3)" strokeWidth="1" />
        </svg>

        {/* Rotating segment */}
        <motion.svg
          viewBox="0 0 128 128"
          style={{ position: 'absolute', inset: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        >
          <circle
            cx="64" cy="64" r="58"
            fill="none"
            stroke="url(#scanGrad)"
            strokeWidth="2"
            strokeDasharray="80 284"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="scanGrad" gradientUnits="userSpaceOnUse"
              x1="64" y1="6" x2="122" y2="64">
              <stop offset="0%" stopColor="#00c8ff" stopOpacity="0" />
              <stop offset="100%" stopColor="#00c8ff" stopOpacity="1" />
            </linearGradient>
          </defs>
        </motion.svg>

        {/* Inner pulsing dot */}
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 12, height: 12,
            borderRadius: '50%',
            background: '#00c8ff',
            boxShadow: '0 0 20px #00c8ff',
          }}
        />
      </div>

      {/* Text */}
      <motion.div
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2.5, repeat: Infinity }}
        className="font-display text-lg font-bold tracking-[0.3em] mb-2 text-glow"
        style={{ color: '#00c8ff' }}
      >
        AWAITING CONNECTIONS
      </motion.div>
      <div
        className="font-mono text-xs tracking-widest"
        style={{ color: '#4a7090' }}
      >
        Scan QR code to connect a camera
      </div>

      {/* Animated lines */}
      <div className="flex gap-1 mt-8">
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.div
            key={i}
            animate={{ height: [4, 8 + Math.random() * 16, 4], opacity: [0.2, 0.6, 0.2] }}
            transition={{
              duration: 1 + Math.random(),
              repeat: Infinity,
              delay: i * 0.1,
            }}
            style={{
              width: 3,
              background: '#00c8ff',
              borderRadius: 1,
            }}
          />
        ))}
      </div>
    </div>
  )
}

export default function CameraGrid({ cameras }) {
  const count = cameras.length
  const cols = useMemo(() => getGridColumns(count), [count])
  const { activeAudioCameraId, setActiveAudioCameraId } = useNarrationSettings()

  // Narrador IA: si nadie tiene el "micrófono" todavía, se lo asignamos a la
  // primera cámara conectada. Si la cámara que lo tenía se desconectó,
  // pasamos el foco a otra disponible (o lo dejamos en null si no queda
  // ninguna — las demás siguen mostrando subtítulos en silencio).
  useEffect(() => {
    if (count === 0) return
    const stillThere = cameras.some((c) => c.cameraId === activeAudioCameraId)
    if (!activeAudioCameraId || !stillThere) {
      setActiveAudioCameraId(cameras[0].cameraId)
    }
  }, [cameras, count, activeAudioCameraId, setActiveAudioCameraId])

  if (count === 0) {
    return (
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <WaitingScreen />
      </div>
    )
  }

  return (
    <div
      className="flex-1 overflow-hidden p-2"
      style={{ minHeight: 0 }}
    >
      <motion.div
        layout
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 6,
          height: '100%',
          alignContent: count === 1 ? 'stretch' : 'start',
        }}
      >
        <AnimatePresence mode="popLayout">
          {cameras.map(({ cameraId, deviceName, stream }) => (
            <CameraTile
              key={cameraId}
              cameraId={cameraId}
              deviceName={deviceName}
              stream={stream}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
