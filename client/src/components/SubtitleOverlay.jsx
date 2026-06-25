// client/src/components/SubtitleOverlay.jsx
import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const STATE_LABEL = {
  analizando: 'ANALIZANDO',
  narrando: 'NARRANDO',
  sin_novedad: 'MONITOREANDO',
  error: 'ERROR IA',
  idle: 'IA EN ESPERA',
}

export default function SubtitleOverlay({ subtitle, state, personDetected, model, hasMic }) {
  const label = STATE_LABEL[state] || 'IA'
  const color = personDetected ? '#ff9900' : '#00c8ff'

  return (
    <>
      {/* Badge de estado del narrador IA */}
      <div className="absolute z-10" style={{ top: 26, right: 8, pointerEvents: 'none' }}>
        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[8px] tracking-wider"
          style={{
            background: personDetected ? 'rgba(255,153,0,0.15)' : 'rgba(0,200,255,0.08)',
            border: `1px solid ${personDetected ? 'rgba(255,153,0,0.4)' : 'rgba(0,200,255,0.25)'}`,
            color,
          }}
          title={model ? `Modelo: ${model}` : undefined}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: color,
              boxShadow: `0 0 6px ${color}`,
            }}
          />
          {label}
          {hasMic && (
            <svg width="8" height="8" viewBox="0 0 24 24" fill={color} style={{ marginLeft: 2 }}>
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
            </svg>
          )}
        </div>
      </div>

      {/* Subtítulo */}
      <AnimatePresence>
        {subtitle && (
          <motion.div
            key={subtitle}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute left-2 right-2 z-20"
            style={{ bottom: 30 }}
          >
            <div
              className="px-2.5 py-1.5 rounded font-mono"
              style={{
                background: 'rgba(5,8,16,0.85)',
                border: `1px solid ${personDetected ? 'rgba(255,153,0,0.35)' : 'rgba(0,200,255,0.25)'}`,
                color: '#e0f0ff',
                fontSize: 11,
                lineHeight: 1.4,
                backdropFilter: 'blur(4px)',
              }}
            >
              {subtitle}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
