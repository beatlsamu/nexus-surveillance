import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { socket } from '../socket.js'

export default function ConnectionStatus() {
  const [connected, setConnected] = useState(socket.connected)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onConnect = () => {
      setConnected(true)
      setVisible(true)
      setTimeout(() => setVisible(false), 3000)
    }
    const onDisconnect = () => {
      setConnected(false)
      setVisible(true)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded font-mono text-xs flex items-center gap-2"
          style={{
            background: connected ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)',
            border: `1px solid ${connected ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,102,0.3)'}`,
            color: connected ? '#00ff88' : '#ff3366',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: connected ? '#00ff88' : '#ff3366',
              boxShadow: `0 0 8px ${connected ? '#00ff88' : '#ff3366'}`,
            }}
          />
          {connected ? 'SERVER CONNECTED' : 'CONNECTION LOST — RECONNECTING...'}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
