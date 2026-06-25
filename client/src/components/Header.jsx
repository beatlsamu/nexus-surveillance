import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNarrationSettings } from '../context/NarrationContext.jsx'

export default function Header({ cameraCount, roomId, mobileUrl }) {
  const [time, setTime] = useState(new Date())
  const [copied, setCopied] = useState(false)
  const { enabled: aiEnabled, toggleEnabled: toggleAi } = useNarrationSettings()

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const pad = (n) => String(n).padStart(2, '0')
  const timeStr = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`
  const dateStr = time.toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  }).toUpperCase()

  const copyLink = async () => {
    if (!mobileUrl) return
    await navigator.clipboard.writeText(mobileUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <header
      className="glass flex items-center justify-between px-5 py-3 flex-shrink-0"
      style={{ borderBottom: '1px solid rgba(0,200,255,0.15)', minHeight: 56 }}
    >
      {/* Left: Logo */}
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="relative w-8 h-8 flex items-center justify-center">
          <svg viewBox="0 0 32 32" width="32" height="32" fill="none">
            <polygon
              points="16,2 30,28 2,28"
              stroke="#00c8ff"
              strokeWidth="1.5"
              fill="rgba(0,200,255,0.1)"
            />
            <circle cx="16" cy="20" r="3" fill="#00c8ff" />
            <line x1="16" y1="10" x2="16" y2="17" stroke="#00c8ff" strokeWidth="1.5" />
          </svg>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(0,200,255,0.15) 0%, transparent 70%)',
              animation: 'pulseDot 2s ease-in-out infinite',
            }}
          />
        </div>
        <div>
          <div
            className="text-glow font-display font-bold tracking-[0.2em] text-sm"
            style={{ color: '#00c8ff', letterSpacing: '0.25em' }}
          >
            NEXUS
          </div>
          <div
            className="font-body text-[9px] tracking-[0.35em]"
            style={{ color: 'rgba(0,200,255,0.5)' }}
          >
            SURVEILLANCE SYSTEM
          </div>
        </div>
      </div>

      {/* Center: Stats */}
      <div className="hidden md:flex items-center gap-6">
        {/* Live clock */}
        <div className="text-center">
          <div className="font-mono text-xl font-semibold" style={{ color: '#e0f0ff', letterSpacing: '0.1em' }}>
            {timeStr}
          </div>
          <div className="font-mono text-[9px]" style={{ color: '#4a7090' }}>
            {dateStr}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 32, background: 'rgba(0,200,255,0.15)' }} />

        {/* Active streams counter */}
        <div className="text-center">
          <motion.div
            key={cameraCount}
            initial={{ scale: 1.3, color: '#00c8ff' }}
            animate={{ scale: 1, color: '#e0f0ff' }}
            className="font-display text-2xl font-bold"
          >
            {String(cameraCount).padStart(2, '0')}
          </motion.div>
          <div className="font-mono text-[9px] tracking-widest" style={{ color: '#4a7090' }}>
            ACTIVE STREAMS
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 32, background: 'rgba(0,200,255,0.15)' }} />

        {/* Server status */}
        <div className="flex items-center gap-2">
          <div className="pulse-dot" />
          <div>
            <div className="font-mono text-[10px] font-semibold" style={{ color: '#00ff88' }}>
              ONLINE
            </div>
            <div className="font-mono text-[8px]" style={{ color: '#4a7090' }}>
              SERVER STATUS
            </div>
          </div>
        </div>
      </div>

      {/* Right: AI Narrator toggle + Room ID + Copy */}
      <div className="flex items-center gap-3">
        {/* Narrador de Seguridad IA — interruptor maestro */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleAi}
          className="flex items-center gap-2 px-3 py-1.5 rounded font-mono text-[10px] tracking-wider transition-all"
          style={{
            background: aiEnabled ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.08)',
            border: `1px solid ${aiEnabled ? 'rgba(0,255,136,0.35)' : 'rgba(255,51,102,0.25)'}`,
            color: aiEnabled ? '#00ff88' : '#ff3366',
            cursor: 'pointer',
          }}
          title="Narrador de Seguridad IA: visión + voz + subtítulos en vivo"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10a7 7 0 0 1-14 0M12 17v4M8 21h8" />
          </svg>
          IA SEGURIDAD {aiEnabled ? 'ON' : 'OFF'}
        </motion.button>

        {roomId && (
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded"
            style={{
              background: 'rgba(0,200,255,0.05)',
              border: '1px solid rgba(0,200,255,0.2)',
            }}
          >
            <span className="font-mono text-[9px]" style={{ color: '#4a7090' }}>ROOM</span>
            <span className="font-mono text-[11px] font-semibold" style={{ color: '#00c8ff' }}>
              {roomId.toUpperCase()}
            </span>
          </div>
        )}

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={copyLink}
          className="flex items-center gap-2 px-3 py-1.5 rounded font-mono text-[10px] tracking-wider transition-all"
          style={{
            background: copied ? 'rgba(0,255,136,0.1)' : 'rgba(0,200,255,0.08)',
            border: `1px solid ${copied ? 'rgba(0,255,136,0.4)' : 'rgba(0,200,255,0.25)'}`,
            color: copied ? '#00ff88' : '#00c8ff',
            cursor: 'pointer',
          }}
        >
          {copied ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              COPIED
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              COPY LINK
            </>
          )}
        </motion.button>
      </div>
    </header>
  )
}
