// client/src/hooks/useWebRTC.js
import { useEffect, useRef, useState, useCallback } from 'react'
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

export function useWebRTC() {
  const [cameras, setCameras] = useState([])
  const peersRef = useRef(new Map())
  const pendingCandidates = useRef(new Map())
  const roomIdRef = useRef(null)

  const createPeer = useCallback((cameraId, deviceName) => {
    const existing = peersRef.current.get(cameraId)
    if (existing) {
      try { existing.close() } catch (_) {}
      peersRef.current.delete(cameraId)
    }

    const peer = new RTCPeerConnection(ICE_CONFIG)
    peersRef.current.set(cameraId, peer)
    pendingCandidates.current.set(cameraId, [])

    peer.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track])
      setCameras((prev) => {
        const exists = prev.find((c) => c.cameraId === cameraId)
        if (exists) {
          return prev.map((c) =>
            c.cameraId === cameraId ? { ...c, stream } : c
          )
        }
        return [...prev, { cameraId, deviceName, stream }]
      })
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:ice-candidate', {
          cameraId,
          viewerId: socket.id,
          candidate: event.candidate,
          fromViewer: true,
        })
      }
    }

    peer.oniceconnectionstatechange = () => {
      const state = peer.iceConnectionState
      console.log(`[WebRTC] ICE state for ${cameraId}: ${state}`)
      if (state === 'failed' || state === 'disconnected') {
        console.warn(`[WebRTC] Peer ${cameraId} ICE ${state}`)
      }
    }

    return peer
  }, [])

  const flushCandidates = useCallback(async (cameraId) => {
    const peer = peersRef.current.get(cameraId)
    const queue = pendingCandidates.current.get(cameraId) || []
    for (const candidate of queue) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (e) {
        console.warn(`[WebRTC] addIceCandidate failed for ${cameraId}:`, e)
      }
    }
    pendingCandidates.current.set(cameraId, [])
  }, [])

  const registerViewer = useCallback(() => {
    socket.emit('viewer:ready', { roomId: roomIdRef.current || '' })
  }, [])

  useEffect(() => {
    registerViewer()

    const onCameraNew = ({ cameraId, deviceName }) => {
      console.log(`[Dashboard] camera:new ${cameraId}`)
      createPeer(cameraId, deviceName)
      socket.emit('viewer:waiting', { cameraId })
    }

    const onOffer = async ({ cameraId, sdp }) => {
      const peer = peersRef.current.get(cameraId)
      if (!peer) {
        console.warn(`[Dashboard] Offer for unknown peer ${cameraId}`)
        return
      }
      if (peer.signalingState === 'closed') return

      try {
        await peer.setRemoteDescription(new RTCSessionDescription(sdp))
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        socket.emit('webrtc:answer', {
          cameraId,
          viewerId: socket.id,
          sdp: answer,
        })
        await flushCandidates(cameraId)
      } catch (err) {
        console.error(`[Dashboard] Error processing offer for ${cameraId}:`, err)
      }
    }

    const onIceCandidate = async ({ cameraId, candidate }) => {
      const peer = peersRef.current.get(cameraId)
      if (!peer) return

      if (!peer.remoteDescription) {
        const queue = pendingCandidates.current.get(cameraId) || []
        queue.push(candidate)
        pendingCandidates.current.set(cameraId, queue)
        return
      }

      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (e) {
        console.warn(`[Dashboard] addIceCandidate error for ${cameraId}:`, e)
      }
    }

    const onCameraDisconnect = ({ cameraId }) => {
      console.log(`[Dashboard] camera:disconnect ${cameraId}`)
      const peer = peersRef.current.get(cameraId)
      if (peer) {
        try { peer.close() } catch (_) {}
        peersRef.current.delete(cameraId)
      }
      pendingCandidates.current.delete(cameraId)
      setCameras((prev) => prev.filter((c) => c.cameraId !== cameraId))
    }

    const onReconnect = () => {
      console.log('[Dashboard] Socket reconnected — re-registering viewer')
      peersRef.current.forEach((peer) => {
        try { peer.close() } catch (_) {}
      })
      peersRef.current.clear()
      pendingCandidates.current.clear()
      setCameras([])
      registerViewer()
    }

    socket.on('camera:new', onCameraNew)
    socket.on('webrtc:offer', onOffer)
    socket.on('webrtc:ice-candidate', onIceCandidate)
    socket.on('camera:disconnect', onCameraDisconnect)
    socket.on('reconnect', onReconnect)

    return () => {
      socket.off('camera:new', onCameraNew)
      socket.off('webrtc:offer', onOffer)
      socket.off('webrtc:ice-candidate', onIceCandidate)
      socket.off('camera:disconnect', onCameraDisconnect)
      socket.off('reconnect', onReconnect)
      peersRef.current.forEach((peer) => {
        try { peer.close() } catch (_) {}
      })
      peersRef.current.clear()
    }
  }, [createPeer, flushCandidates, registerViewer])

  return { cameras }
}
