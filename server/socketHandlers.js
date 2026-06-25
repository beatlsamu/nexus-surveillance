// server/socketHandlers.js
// Pure signaling relay — never touches WebRTC directly

/**
 * State kept in memory for the session:
 *   cameras: Map<cameraId, { socketId, deviceName, roomId }>
 *   viewers:  Set<socketId>  — all currently connected dashboard instances
 *
 * Signaling contract (multi-viewer):
 *   Every offer/answer/ICE event now carries a `viewerId` field so that
 *   the server can route messages to a specific peer pair instead of a
 *   single global viewerSocketId.
 *
 *   camera → viewer direction: camera includes `viewerId` in every event.
 *   viewer → camera direction: server stamps `viewerId` = socket.id before
 *                              forwarding, so the camera knows which of its
 *                              RTCPeerConnections to use.
 */

const { NarrationEngine } = require('./narrationEngine')

let cameras = new Map()  // cameraId → { socketId, deviceName, roomId }
let viewers  = new Set() // Set of viewer socketIds

function setupSocketHandlers(io) {
  // Motor de "Narrador de Seguridad IA": rueda de modelos de visión NVIDIA NIM
  // + edge-tts. Se instancia una sola vez y se comparte entre todas las
  // conexiones — mantiene su propio contexto por cámara internamente.
  const narrationEngine = new NarrationEngine({ io })

  io.on('connection', (socket) => {
    console.log(`[SOCKET] Connected: ${socket.id}`)

    // ─────────────────────────────────────────────────────
    // CAMERA: mobile phone joins as a camera
    // ─────────────────────────────────────────────────────
    socket.on('camera:join', ({ cameraId, roomId, deviceName }) => {
      console.log(`[CAMERA] Join: ${cameraId} (${deviceName}) room=${roomId}`)
      cameras.set(cameraId, { socketId: socket.id, deviceName, roomId })

      // Notify every connected viewer of this new camera.
      // Each viewer will independently emit viewer:waiting to kick off its own handshake.
      viewers.forEach((viewerId) => {
        io.to(viewerId).emit('camera:new', { cameraId, deviceName })
        console.log(`[SIGNAL] Notified viewer ${viewerId} of camera:new ${cameraId}`)
      })
    })

    // ─────────────────────────────────────────────────────
    // VIEWER: dashboard registers itself
    // ─────────────────────────────────────────────────────
    socket.on('viewer:ready', ({ roomId }) => {
      console.log(`[VIEWER] Ready: socket=${socket.id} room=${roomId}`)
      viewers.add(socket.id)
      socket.join('viewers')

      // Send metadata list so the UI can render placeholder tiles immediately
      const cameraList = []
      cameras.forEach((info, cameraId) => {
        cameraList.push({ cameraId, deviceName: info.deviceName })
      })
      socket.emit('camera:list', cameraList)

      // Emit camera:new for each existing camera so *this* viewer triggers
      // its own viewer:waiting → handshake sequence with every camera.
      cameraList.forEach(({ cameraId, deviceName }) => {
        socket.emit('camera:new', { cameraId, deviceName })
      })
    })

    // ─────────────────────────────────────────────────────
    // VIEWER → CAMERA: viewer is ready to receive from a specific camera.
    // We stamp the sender's socket.id as viewerId so the camera can create
    // a dedicated RTCPeerConnection for this viewer.
    // ─────────────────────────────────────────────────────
    socket.on('viewer:waiting', ({ cameraId }) => {
      const cam = cameras.get(cameraId)
      if (!cam) {
        console.warn(`[SIGNAL] viewer:waiting for unknown camera ${cameraId}`)
        return
      }
      console.log(
        `[SIGNAL] viewer:waiting → camera ${cameraId} (viewerId=${socket.id})`
      )
      io.to(cam.socketId).emit('viewer:waiting', { viewerId: socket.id })
    })

    // ─────────────────────────────────────────────────────
    // CAMERA → VIEWER: SDP offer relay
    // The camera must include `viewerId` so we can route to the correct viewer.
    // ─────────────────────────────────────────────────────
    socket.on('webrtc:offer', ({ cameraId, viewerId, sdp }) => {
      if (!viewers.has(viewerId)) {
        console.warn(
          `[SIGNAL] webrtc:offer discarded — viewer ${viewerId} not connected`
        )
        return
      }
      console.log(`[SIGNAL] offer relay  ${cameraId} → viewer ${viewerId}`)
      // Viewer only needs cameraId + sdp; viewerId is implicit (it's the socket)
      io.to(viewerId).emit('webrtc:offer', { cameraId, sdp })
    })

    // ─────────────────────────────────────────────────────
    // VIEWER → CAMERA: SDP answer relay
    // Viewer includes `viewerId` (its own socket.id) so the camera knows
    // which RTCPeerConnection should consume this answer.
    // ─────────────────────────────────────────────────────
    socket.on('webrtc:answer', ({ cameraId, viewerId, sdp }) => {
      const cam = cameras.get(cameraId)
      if (!cam) {
        console.warn(`[SIGNAL] webrtc:answer for unknown camera ${cameraId}`)
        return
      }
      console.log(`[SIGNAL] answer relay viewer ${viewerId} → ${cameraId}`)
      io.to(cam.socketId).emit('webrtc:answer', { cameraId, viewerId, sdp })
    })

    // ─────────────────────────────────────────────────────
    // ICE CANDIDATE relay (bidirectional)
    //   fromViewer=true  → viewer sent it; relay to camera (include viewerId)
    //   fromViewer=false → camera sent it (includes viewerId); relay to that viewer
    // ─────────────────────────────────────────────────────
    socket.on('webrtc:ice-candidate', ({ cameraId, viewerId, candidate, fromViewer }) => {
      if (fromViewer) {
        // Viewer → Camera: stamp viewerId so camera picks the right peer
        const cam = cameras.get(cameraId)
        if (cam) {
          io.to(cam.socketId).emit('webrtc:ice-candidate', {
            cameraId,
            viewerId,
            candidate,
            fromViewer,
          })
        }
      } else {
        // Camera → specific Viewer
        if (viewerId && viewers.has(viewerId)) {
          io.to(viewerId).emit('webrtc:ice-candidate', {
            cameraId,
            viewerId,
            candidate,
            fromViewer,
          })
        }
      }
    })

    // ─────────────────────────────────────────────────────
    // VIEWER → SERVER: frame capturado del <video> del dashboard para
    // análisis del "Narrador de Seguridad IA". Se procesa de forma
    // asíncrona y la respuesta (texto + audio + cues) se emite por
    // 'narration:update' / 'narration:status' al mismo socket que lo envió.
    // ─────────────────────────────────────────────────────
    socket.on('vision:frame', ({ cameraId, deviceName, image, mimeType }) => {
      if (!cameraId || !image) {
        console.warn(`[IA-Narrador] vision:frame descartado (faltan datos) de socket=${socket.id}`)
        return
      }
      console.log(`[IA-Narrador] frame recibido de cámara="${cameraId}" (${deviceName || 'sin nombre'}), ~${Math.round(image.length / 1024)}KB`)
      narrationEngine
        .processFrame({
          cameraId,
          deviceName,
          imageBase64: image,
          mimeType: mimeType || 'image/jpeg',
          targetSocketId: socket.id,
        })
        .catch((err) => console.error('[NarrationEngine] processFrame error:', err))
    })

    // ─────────────────────────────────────────────────────
    // DISCONNECT: clean up camera or viewer
    // ─────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[SOCKET] Disconnected: ${socket.id}`)

      // ── Was it a camera? ──────────────────────────────
      let disconnectedCameraId = null
      cameras.forEach((info, cameraId) => {
        if (info.socketId === socket.id) disconnectedCameraId = cameraId
      })

      if (disconnectedCameraId) {
        cameras.delete(disconnectedCameraId)
        console.log(`[CAMERA] Removed: ${disconnectedCameraId}`)
        // Notify every viewer so it can close its peer for this camera
        viewers.forEach((viewerId) => {
          io.to(viewerId).emit('camera:disconnect', {
            cameraId: disconnectedCameraId,
          })
        })
      }

      // ── Was it a viewer? ──────────────────────────────
      if (viewers.has(socket.id)) {
        viewers.delete(socket.id)
        console.log(`[VIEWER] Disconnected: ${socket.id}`)
        // Notify every camera so it can close and free the peer for this viewer
        cameras.forEach((info) => {
          io.to(info.socketId).emit('viewer:disconnect', {
            viewerId: socket.id,
          })
        })
      }
    })
  })

  return { narrationEngine }
}

module.exports = { setupSocketHandlers }