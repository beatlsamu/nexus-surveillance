import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function QRPanel({ cameras }) {
  const [qrData, setQrData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const fetchQR = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/qr', {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      })
      const data = await res.json()
      setQrData(data)
    } catch (err) {
      console.error('[QR] Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const regenerate = async () => {
    setRegenerating(true)
    try {
      const res = await fetch('/api/qr/regenerate', {
        method: 'POST',
        headers: { 'ngrok-skip-browser-warning': 'true' },
      })
      const data = await res.json()
      setQrData(data)
    } catch (err) {
      console.error('[QR] Regenerate error:', err)
    } finally {
      setRegenerating(false)
    }
  }

  useEffect(() => {
    fetchQR()
  }, [])

  const copyUrl = async () => {
    if (!qrData?.url) return
    await navigator.clipboard.writeText(qrData.url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="glass flex flex-col gap-4 p-4 overflow-y-auto"
      style={{ width: 260, flexShrink: 0, borderLeft: '1px solid rgba(0,200,255,0.12)' }}
    >
      {/* Header */}
      <div>
        <div className="font-mono text-[10px] tracking-[0.3em]" style={{ color: '#4a7090' }}>
          CONNECT CAMERA
        </div>
        <div className="font-display text-sm font-semibold mt-0.5" style={{ color: '#00c8ff' }}>
          QR Access Point
        </div>
      </div>

      {/* QR Code */}
      <div
        className="relative rounded-lg overflow-hidden flex items-center justify-center"
        style={{
          background: '#050810',
          border: '1px solid rgba(0,200,255,0.2)',
          aspectRatio: '1',
          boxShadow: '0 0 20px rgba(0,200,255,0.1)',
        }}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              style={{
                width: 32, height: 32,
                border: '2px solid rgba(0,200,255,0.2)',
                borderTopColor: '#00c8ff',
                borderRadius: '50%',
              }}
            />
            <span className="font-mono text-[9px]" style={{ color: '#4a7090' }}>GENERATING...</span>
          </div>
        ) : qrData?.qr ? (
          <motion.img
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            src={qrData.qr}
            alt="QR Code"
            className="w-full h-full"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <div className="font-mono text-[10px] text-center p-4" style={{ color: '#ff3366' }}>
            QR generation failed.<br />Check server connection.
          </div>
        )}

        {/* Corner decorations */}
        {[
          { top: 4, left: 4, rotate: 0 },
          { top: 4, right: 4, rotate: 90 },
          { bottom: 4, right: 4, rotate: 180 },
          { bottom: 4, left: 4, rotate: 270 },
        ].map((pos, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              ...pos,
              width: 12,
              height: 12,
              borderTop: `1.5px solid #00c8ff`,
              borderLeft: `1.5px solid #00c8ff`,
              transform: `rotate(${pos.rotate}deg)`,
              opacity: 0.7,
            }}
          />
        ))}
      </div>

      {/* Instructions */}
      <div
        className="rounded p-3 text-center"
        style={{ background: 'rgba(0,200,255,0.04)', border: '1px solid rgba(0,200,255,0.1)' }}
      >
        <div className="font-mono text-[9px] leading-relaxed" style={{ color: '#4a7090' }}>
          Scan with your phone to<br />
          <span style={{ color: '#00c8ff' }}>connect a live camera</span>
        </div>
      </div>

      {/* URL */}
      {qrData?.url && (
        <button
          onClick={copyUrl}
          className="w-full rounded p-2 text-left transition-all cursor-pointer"
          style={{
            background: copied ? 'rgba(0,255,136,0.05)' : 'rgba(0,0,0,0.2)',
            border: `1px solid ${copied ? 'rgba(0,255,136,0.3)' : 'rgba(0,200,255,0.1)'}`,
          }}
        >
          <div className="font-mono text-[8px] mb-1" style={{ color: '#4a7090' }}>
            {copied ? '✓ COPIED TO CLIPBOARD' : 'TAP TO COPY URL'}
          </div>
          <div
            className="font-mono text-[9px] break-all leading-relaxed"
            style={{ color: copied ? '#00ff88' : '#00c8ff' }}
          >
            {qrData.url}
          </div>
        </button>
      )}

      {/* Devices counter */}
      <div
        className="flex items-center justify-between rounded p-3"
        style={{ background: 'rgba(0,200,255,0.04)', border: '1px solid rgba(0,200,255,0.1)' }}
      >
        <span className="font-mono text-[9px]" style={{ color: '#4a7090' }}>CONNECTED</span>
        <div className="flex items-center gap-2">
          <div className="pulse-dot" style={{ width: 6, height: 6 }} />
          <span className="font-display text-sm font-bold" style={{ color: cameras.length > 0 ? '#00ff88' : '#4a7090' }}>
            {cameras.length} / 16
          </span>
        </div>
      </div>

      {/* Active cameras list */}
      <div className="flex flex-col gap-1 flex-1 min-h-0">
        <div className="font-mono text-[9px] tracking-widest" style={{ color: '#4a7090' }}>
          ACTIVE STREAMS
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto">
          <AnimatePresence>
            {cameras.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="font-mono text-[10px] py-4 text-center"
                style={{ color: '#4a7090' }}
              >
                No cameras connected
              </motion.div>
            ) : (
              cameras.map(({ cameraId, deviceName }) => (
                <motion.div
                  key={cameraId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="flex items-center justify-between rounded px-2 py-1.5"
                  style={{
                    background: 'rgba(0,255,136,0.04)',
                    border: '1px solid rgba(0,255,136,0.15)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="pulse-dot" style={{ width: 5, height: 5 }} />
                    <span className="font-mono text-[9px]" style={{ color: '#e0f0ff' }}>
                      {deviceName || cameraId}
                    </span>
                  </div>
                  <span
                    className="font-mono text-[8px] px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88' }}
                  >
                    LIVE
                  </span>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Regenerate button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={regenerate}
        disabled={regenerating}
        className="w-full py-2 rounded font-mono text-[10px] tracking-widest transition-all cursor-pointer"
        style={{
          background: 'rgba(0,200,255,0.06)',
          border: '1px solid rgba(0,200,255,0.2)',
          color: regenerating ? '#4a7090' : '#00c8ff',
          cursor: regenerating ? 'not-allowed' : 'pointer',
        }}
      >
        {regenerating ? 'GENERATING...' : '⟳ NEW ROOM'}
      </motion.button>
    </div>
  )
}
