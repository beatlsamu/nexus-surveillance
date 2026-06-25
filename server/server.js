// server/server.js
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../.env') })

const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const QRCode = require('qrcode')
const { v4: uuidv4 } = require('uuid')
const { setupSocketHandlers } = require('./socketHandlers')

const app = express()
const httpServer = createServer(app)

const PORT = process.env.PORT || 3000
const BASE_URL = process.env.BASE_URL ||'http://localhost:3000'

// ─────────────────────────────────────────────────────
// Session-persistent roomId (same across requests until restart)
// ─────────────────────────────────────────────────────
let sessionRoomId = uuidv4().slice(0, 8)

// ─────────────────────────────────────────────────────
// CORS & ngrok header middleware
// ─────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'ngrok-skip-browser-warning'],
}))

app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true')
  next()
})

app.use(express.json())

// ─────────────────────────────────────────────────────
// Static files (production build)
// ─────────────────────────────────────────────────────
const distPath = path.join(__dirname, '../client/dist')
app.use(express.static(distPath))

// ─────────────────────────────────────────────────────
// QR endpoint
// ─────────────────────────────────────────────────────
app.get('/api/qr', async (req, res) => {
  try {
    const mobileUrl = `${BASE_URL}/mobile?room=${sessionRoomId}`
    const qrDataUrl = await QRCode.toDataURL(mobileUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#00c8ff',
        light: '#050810',
      },
    })
    res.json({
      qr: qrDataUrl,
      url: mobileUrl,
      roomId: sessionRoomId,
    })
  } catch (err) {
    console.error('[QR] Error generating QR:', err)
    res.status(500).json({ error: 'Failed to generate QR code' })
  }
})

// Regenerate room endpoint
app.post('/api/qr/regenerate', async (req, res) => {
  sessionRoomId = uuidv4().slice(0, 8)
  const mobileUrl = `${BASE_URL}/mobile?room=${sessionRoomId}`
  try {
    const qrDataUrl = await QRCode.toDataURL(mobileUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#00c8ff',
        light: '#050810',
      },
    })
    res.json({
      qr: qrDataUrl,
      url: mobileUrl,
      roomId: sessionRoomId,
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to regenerate QR code' })
  }
})

// ─────────────────────────────────────────────────────
// Socket.IO + Narrador de Seguridad IA
// (se inicializan antes de las rutas para poder registrar
//  /api/narration/status antes del catch-all del SPA)
// ─────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
})

const { narrationEngine } = setupSocketHandlers(io)

// Estado de la rueda de modelos de visión (útil para debug / panel admin)
app.get('/api/narration/status', (req, res) => {
  res.json(narrationEngine.status())
})

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.setHeader('ngrok-skip-browser-warning', 'true')
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('NEXUS SURVEILLANCE — run npm run build first for production')
    }
  })
})

// ─────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════╗`)
  console.log(`║       NEXUS SURVEILLANCE v1.0            ║`)
  console.log(`╠══════════════════════════════════════════╣`)
  console.log(`║  Server  : http://localhost:${PORT}          ║`)
  console.log(`║  Public  : ${BASE_URL.slice(0, 30)}... ║`)
  console.log(`║  Room ID : ${sessionRoomId}                  ║`)
  console.log(`╚══════════════════════════════════════════╝\n`)
})

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERROR] Port ${PORT} in use. Kill node processes and retry.`)
    process.exit(1)
  }
})

process.on('SIGTERM', () => httpServer.close())
process.on('SIGINT', () => httpServer.close())
