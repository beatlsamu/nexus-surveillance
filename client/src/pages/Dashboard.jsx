import React, { useState, useEffect } from 'react'
import Header from '../components/Header.jsx'
import CameraGrid from '../components/CameraGrid.jsx'
import QRPanel from '../components/QRPanel.jsx'
import ConnectionStatus from '../components/ConnectionStatus.jsx'
import { useWebRTC } from '../hooks/useWebRTC.js'
import { socket } from '../socket.js'   // <-- Importamos el socket directamente
import { NarrationProvider } from '../context/NarrationContext.jsx'

export default function Dashboard() {
  const { cameras } = useWebRTC()
  const [qrInfo, setQrInfo] = useState({ url: '', roomId: '' })

  // Fetch QR info for header display
  useEffect(() => {
    fetch('/api/qr', {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    })
      .then((r) => r.json())
      .then((data) => setQrInfo({ url: data.url, roomId: data.roomId }))
      .catch(() => {})
  }, [])

  // 🔧 FUERZA EL REGISTRO DEL VIEWER (solución temporal)
  useEffect(() => {
    const register = () => {
      console.log('[Dashboard] Emitiendo viewer:ready manualmente')
      socket.emit('viewer:ready', { roomId: qrInfo.roomId || '' })
    }

    if (socket.connected) {
      register()
    } else {
      socket.once('connect', register)
    }

    // Re-registrar si el socket se reconecta
    const onReconnect = () => {
      console.log('[Dashboard] Socket reconnect, re-registering')
      register()
    }
    socket.on('reconnect', onReconnect)

    return () => {
      socket.off('reconnect', onReconnect)
    }
  }, [qrInfo.roomId])  // Se ejecturá cada vez que tengamos roomId

  // Verificar si el socket está conectado (debug)
  useEffect(() => {
    console.log('[Dashboard] Socket connected?', socket.connected)
    const onConnect = () => console.log('[Dashboard] Socket connected event')
    const onDisconnect = () => console.log('[Dashboard] Socket disconnected')
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [])

  return (
    <NarrationProvider>
      <div
        className="grid-bg flex flex-col w-full h-full overflow-hidden"
        style={{ background: '#050810' }}
      >
        {/* Ambient scan line */}
        <div className="scan-line" />

        {/* Header */}
        <Header
          cameraCount={cameras.length}
          roomId={qrInfo.roomId}
          mobileUrl={qrInfo.url}
        />

        {/* Main area */}
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          {/* Camera grid */}
          <CameraGrid cameras={cameras} />

          {/* Right panel */}
          <QRPanel cameras={cameras} />
        </div>

        {/* Connection status toast */}
        <ConnectionStatus />
      </div>
    </NarrationProvider>
  )
}
