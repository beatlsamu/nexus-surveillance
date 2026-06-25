// client/src/hooks/useMobileStream.js
import { useEffect, useRef, useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { socket } from '../socket.js'

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    {
      urls: 'turn:relay.metered.ca:80',
      username: '9689437adc99e3e6e18a0600',
      credential: 'z72stAiAfaJ1VEXT',
    },
    {
      urls: 'turn:relay.metered.ca:443',
      username: '9689437adc99e3e6e18a0600',
      credential: 'z72stAiAfaJ1VEXT',
    },
    {
      urls: 'turns:relay.metered.ca:443',
      username: '9689437adc99e3e6e18a0600',
      credential: 'z72stAiAfaJ1VEXT',
    },
  ],
  iceCandidatePoolSize: 10,
}

export const STATUS = {
  INITIALIZING: 'INITIALIZING',
  CAMERA_READY: 'CAMERA_READY',
  CONNECTING: 'CONNECTING',
  STREAMING: 'STREAMING',
  RECONNECTING: 'RECONNECTING',
  OFFLINE: 'OFFLINE',
  ERROR: 'ERROR',
}

const CAMERA_ID = uuidv4().slice(0, 8)
const DEVICE_NAME = `CAM-${CAMERA_ID.toUpperCase()}`

export function useMobileStream(roomId, videoRef) {
  const [status, setStatus] = useState(STATUS.INITIALIZING)
  const [error, setError] = useState(null)
  const [facingMode, setFacingMode] = useState('environment')

  const streamRef = useRef(null)
  const peersRef = useRef(new Map())
  const pendingCandidates = useRef(new Map())
  const connectedViewers = useRef(new Set())
  const heartbeatRef = useRef(null)

  const refreshStatus = useCallback(() => {
    if (connectedViewers.current.size > 0) {
      setStatus(STATUS.STREAMING)
    } else if (peersRef.current.size > 0) {
      setStatus(STATUS.CONNECTING)
    } else {
      setStatus(STATUS.CAMERA_READY)
    }
  }, [])

  const getStream = useCallback(async (facing = 'environment') => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.playsInline = true
        videoRef.current.autoplay = true
        videoRef.current.muted = true
        await videoRef.current.play().catch(() => {})
      }

      stream.getTracks().forEach((track) => {
        track.onended = () => {
          console.log('[Mobile] Track ended — restarting camera')
          getStream(facing)
        }
      })

      setStatus(STATUS.CAMERA_READY)
      return stream
    } catch (err) {
      console.error('[Mobile] getUserMedia error:', err)
      setError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied'
          : 'Cannot access camera'
      )
      setStatus(STATUS.ERROR)
      return null
    }
  }, [videoRef])

  const createPeerForViewer = useCallback((viewerId) => {
    const existing = peersRef.current.get(viewerId)
    if (existing) {
      try { existing.close() } catch (_) {}
      peersRef.current.delete(viewerId)
      connectedViewers.current.delete(viewerId)
    }
    pendingCandidates.current.set(viewerId, [])

    if (!streamRef.current) return null

    const peer = new RTCPeerConnection(ICE_CONFIG)
    peersRef.current.set(viewerId, peer)

    const videoTrack = streamRef.current.getVideoTracks()[0]
    if (videoTrack) {
      peer.addTransceiver(videoTrack, {
        direction: 'sendonly',
        streams: [streamRef.current],
        sendEncodings: [{ maxBitrate: 1500000, scaleResolutionDownBy: 1 }],
      })
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:ice-candidate', {
          cameraId: CAMERA_ID,
          viewerId,
          candidate: event.candidate,
          fromViewer: false,
        })
      }
    }

    peer.oniceconnectionstatechange = () => {
      const state = peer.iceConnectionState
      console.log(`[Mobile] ICE state for viewer ${viewerId}: ${state}`)

      if (state === 'connected' || state === 'completed') {
        connectedViewers.current.add(viewerId)
        setStatus(STATUS.STREAMING)
      } else if (state === 'failed' || state === 'disconnected') {
        connectedViewers.current.delete(viewerId)
        refreshStatus()
      } else if (state === 'closed') {
        connectedViewers.current.delete(viewerId)
        refreshStatus()
      }
    }

    return peer
  }, [refreshStatus])

  const sendOffer = useCallback(async (peer, viewerId) => {
    try {
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      socket.emit('webrtc:offer', {
        cameraId: CAMERA_ID,
        viewerId,
        sdp: offer,
      })
      setStatus(STATUS.CONNECTING)
      console.log(`[Mobile] Offer sent to viewer ${viewerId}`)
    } catch (err) {
      console.error(`[Mobile] createOffer error for viewer ${viewerId}:`, err)
    }
  }, [])

  const joinRoom = useCallback(() => {
    if (!roomId) return
    socket.emit('camera:join', {
      cameraId: CAMERA_ID,
      roomId,
      deviceName: DEVICE_NAME,
    })
    console.log(`[Mobile] Joined room ${roomId} as ${CAMERA_ID}`)
  }, [roomId])

  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    heartbeatRef.current = setInterval(() => {
      if (!socket.connected) setStatus(STATUS.OFFLINE)
    }, 5000)
  }, [])

  const toggleCamera = useCallback(async () => {
    const newFacing = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(newFacing)
    const stream = await getStream(newFacing)
    if (!stream) return
    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack) return
    peersRef.current.forEach((peer) => {
      const sender = peer
        .getSenders()
        .find((s) => s.track && s.track.kind === 'video')
      if (sender) {
        sender.replaceTrack(videoTrack).catch((e) => {
          console.warn('[Mobile] replaceTrack error:', e)
        })
      }
    })
  }, [facingMode, getStream])

  useEffect(() => {
    if (!roomId) {
      setError('No room ID in URL')
      setStatus(STATUS.ERROR)
      return
    }

    let mounted = true

    const init = async () => {
      const stream = await getStream('environment')
      if (!stream || !mounted) return
      joinRoom()
      startHeartbeat()
    }

    init()

    const onViewerWaiting = async ({ viewerId }) => {
      console.log(`[Mobile] viewer:waiting from ${viewerId} — creating peer + offer`)
      const peer = createPeerForViewer(viewerId)
      if (peer) await sendOffer(peer, viewerId)
    }

    const onAnswer = async ({ viewerId, sdp }) => {
      const peer = peersRef.current.get(viewerId)
      if (!peer || peer.signalingState === 'closed') return
      try {
        await peer.setRemoteDescription(new RTCSessionDescription(sdp))
        const queue = pendingCandidates.current.get(viewerId) || []
        for (const c of queue) {
          await peer.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
        }
        pendingCandidates.current.set(viewerId, [])
      } catch (err) {
        console.error(`[Mobile] setRemoteDescription error for viewer ${viewerId}:`, err)
      }
    }

    const onIceCandidate = async ({ viewerId, candidate }) => {
      const peer = peersRef.current.get(viewerId)
      if (!peer) return
      if (!peer.remoteDescription) {
        const queue = pendingCandidates.current.get(viewerId) || []
        queue.push(candidate)
        pendingCandidates.current.set(viewerId, queue)
        return
      }
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (e) {
        console.warn(`[Mobile] addIceCandidate error for viewer ${viewerId}:`, e)
      }
    }

    const onViewerDisconnect = ({ viewerId }) => {
      console.log(`[Mobile] viewer:disconnect ${viewerId}`)
      const peer = peersRef.current.get(viewerId)
      if (peer) {
        try { peer.close() } catch (_) {}
        peersRef.current.delete(viewerId)
      }
      pendingCandidates.current.delete(viewerId)
      connectedViewers.current.delete(viewerId)
      refreshStatus()
    }

    const onReconnect = () => {
      console.log('[Mobile] Socket reconnected — re-joining room')
      setStatus(STATUS.RECONNECTING)
      peersRef.current.forEach((peer) => {
        try { peer.close() } catch (_) {}
      })
      peersRef.current.clear()
      pendingCandidates.current.clear()
      connectedViewers.current.clear()
      joinRoom()
    }

    const onDisconnect = () => setStatus(STATUS.OFFLINE)

    const onVisibility = async () => {
      if (document.visibilityState !== 'visible') return
      console.log('[Mobile] Returned to foreground — checking stream')
      const stream = streamRef.current
      if (!stream || stream.getTracks().some((t) => t.readyState === 'ended')) {
        const newStream = await getStream(facingMode)
        if (!newStream) return
        const videoTrack = newStream.getVideoTracks()[0]
        if (!videoTrack) return
        peersRef.current.forEach((peer) => {
          const sender = peer
            .getSenders()
            .find((s) => s.track && s.track.kind === 'video')
          if (sender) sender.replaceTrack(videoTrack).catch(() => {})
        })
      }
    }

    socket.on('viewer:waiting', onViewerWaiting)
    socket.on('webrtc:answer', onAnswer)
    socket.on('webrtc:ice-candidate', onIceCandidate)
    socket.on('viewer:disconnect', onViewerDisconnect)
    socket.on('reconnect', onReconnect)
    socket.on('disconnect', onDisconnect)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      mounted = false
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      socket.off('viewer:waiting', onViewerWaiting)
      socket.off('webrtc:answer', onAnswer)
      socket.off('webrtc:ice-candidate', onIceCandidate)
      socket.off('viewer:disconnect', onViewerDisconnect)
      socket.off('reconnect', onReconnect)
      socket.off('disconnect', onDisconnect)
      document.removeEventListener('visibilitychange', onVisibility)
      peersRef.current.forEach((peer) => {
        try { peer.close() } catch (_) {}
      })
      peersRef.current.clear()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [
    roomId,
    getStream,
    joinRoom,
    createPeerForViewer,
    sendOffer,
    startHeartbeat,
    refreshStatus,
    facingMode,
  ])

  return {
    status,
    error,
    cameraId: CAMERA_ID,
    deviceName: DEVICE_NAME,
    facingMode,
    toggleCamera,
  }
}
