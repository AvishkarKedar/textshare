/**
 * Ephemeral WebRTC Voice Mesh with Asymmetric / Listener-First Support
 * 
 * Features:
 * - Always-Listen receiver mode: Room participants without mic permission or in passive mode
 *   automatically answer incoming voice offers and play incoming audio streams.
 * - Robust collision handling via polite peer negotiation.
 * - Autoplay policy recovery with window interaction unlock listeners.
 * - Real-time local & remote audio activity / volume detection for speaking avatars.
 * - Hardware Mute & Deafen controls.
 * - Zero server-side recording or audio retention (pure peer-to-peer WebRTC DTLS-SRTP).
 */

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.services.mozilla.com' },
]

export class VoiceMesh {
  constructor(myCid, sendSignal, options = {}) {
    this.myCid = String(myCid)
    this.sendSignal = sendSignal
    this.rtcConfig = { iceServers: options.iceServers || DEFAULT_ICE_SERVERS }
    this.localStream = null
    this.peers = new Map() // peerCid -> { pc, audioEl, pendingCandidates, makingOffer, isSpeaking, analyserInterval }
    this.isMuted = true
    this.isDeafened = false
    this.isActive = false // represents whether local mic is captured and broadcasting
    this.audioCtx = null
    this.activityInterval = null
    this.onSpeaking = () => {}
    this.onConnectionStateChange = () => {}
  }

  // Deterministic polite peer resolution (lexicographical comparison)
  shouldInitiate(peerCid) {
    return this.myCid.localeCompare(String(peerCid)) < 0
  }

  getAudioContext() {
    if (!this.audioCtx && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
      try {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      } catch (_) {}
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {})
    }
    return this.audioCtx
  }

  async start() {
    if (this.isActive && this.localStream) return true
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const error = new Error('Microphone access is unsupported or requires HTTPS.')
      error.name = 'NotSupportedError'
      throw error
    }

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })

    this.isActive = true
    this.setMuted(false)
    this.monitorAudioActivity()

    // Add local tracks to any existing peer connections (e.g. upgraded from listener)
    for (const [peerId, peer] of this.peers.entries()) {
      try {
        const senders = peer.pc.getSenders ? peer.pc.getSenders() : []
        for (const track of this.localStream.getTracks()) {
          if (!senders.some(s => s.track === track)) {
            peer.pc.addTrack(track, this.localStream)
          }
        }
        // Renegotiate if connection is stable
        if (peer.pc.signalingState === 'stable') {
          this.callPeer(peerId)
        }
      } catch (err) {
        console.warn(`[voice] Error attaching local tracks to peer ${peerId}:`, err)
      }
    }

    return true
  }

  setMuted(muted) {
    this.isMuted = Boolean(muted)
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isMuted
      })
    }
    if (this.isMuted) {
      this.onSpeaking(this.myCid, false)
    }
  }

  setDeafened(deafened) {
    this.isDeafened = Boolean(deafened)
    for (const peer of this.peers.values()) {
      try {
        if (peer.audioEl) {
          peer.audioEl.muted = this.isDeafened
        }
      } catch (_) {}
    }
  }

  isPeerSpeaking(peerCid) {
    const peer = this.peers.get(String(peerCid))
    return Boolean(peer?.isSpeaking)
  }

  monitorAudioActivity() {
    if (!this.localStream) return
    const ctx = this.getAudioContext()
    if (!ctx) return

    try {
      const analyser = ctx.createAnalyser()
      const source = ctx.createMediaStreamSource(this.localStream)
      source.connect(analyser)
      analyser.fftSize = 256
      const buffer = new Uint8Array(analyser.frequencyBinCount)

      if (this.activityInterval) clearInterval(this.activityInterval)
      this.activityInterval = setInterval(() => {
        if (this.isMuted || !this.isActive || !this.localStream) {
          this.onSpeaking(this.myCid, false)
          return
        }
        analyser.getByteFrequencyData(buffer)
        const avg = buffer.reduce((a, b) => a + b, 0) / buffer.length
        this.onSpeaking(this.myCid, avg > 25)
      }, 200)
    } catch (error) {
      console.warn('[voice] Local voice activity monitoring unavailable:', error)
    }
  }

  monitorRemoteStream(peerCid, stream) {
    const id = String(peerCid)
    const peer = this.peers.get(id)
    if (!peer || !stream) return

    const ctx = this.getAudioContext()
    if (!ctx) return

    try {
      if (peer.analyserInterval) clearInterval(peer.analyserInterval)
      const analyser = ctx.createAnalyser()
      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)
      analyser.fftSize = 256
      const buffer = new Uint8Array(analyser.frequencyBinCount)

      peer.analyserInterval = setInterval(() => {
        if (this.isDeafened || !peer.pc || peer.pc.connectionState === 'closed') {
          if (peer.isSpeaking) {
            peer.isSpeaking = false
            this.onSpeaking(id, false)
          }
          return
        }
        analyser.getByteFrequencyData(buffer)
        const avg = buffer.reduce((a, b) => a + b, 0) / buffer.length
        const isSpeaking = avg > 20
        if (peer.isSpeaking !== isSpeaking) {
          peer.isSpeaking = isSpeaking
          this.onSpeaking(id, isSpeaking)
        }
      }, 200)
    } catch (err) {
      console.warn(`[voice] Remote stream monitoring failed for ${id}:`, err)
    }
  }

  createPeer(peerCid) {
    const id = String(peerCid)
    if (this.peers.has(id)) return this.peers.get(id)

    let pc
    try {
      pc = new RTCPeerConnection(this.rtcConfig)
    } catch (err) {
      console.error('[voice] Failed to construct RTCPeerConnection:', err)
      return null
    }

    let audioEl
    if (typeof document !== 'undefined') {
      audioEl = document.createElement('audio')
      audioEl.autoplay = true
      audioEl.playsInline = true
      audioEl.setAttribute('playsinline', 'true')
      audioEl.setAttribute('autoplay', 'true')
      audioEl.muted = this.isDeafened
      audioEl.style.display = 'none'
      try {
        if (document.body && !document.body.contains(audioEl)) {
          document.body.appendChild(audioEl)
        }
      } catch (_) {}
    } else {
      audioEl = { muted: this.isDeafened, srcObject: null, play: async () => {}, pause: () => {}, remove: () => {} }
    }

    const peer = {
      pc,
      audioEl,
      pendingCandidates: [],
      makingOffer: false,
      isSpeaking: false,
      analyserInterval: null,
    }
    this.peers.set(id, peer)

    // If we have a local microphone stream, add its audio tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try { pc.addTrack(track, this.localStream) } catch (_) {}
      })
    } else {
      // If we are a passive listener, declare recvonly transceiver so negotiation accepts remote audio
      try {
        pc.addTransceiver('audio', { direction: 'recvonly' })
      } catch (_) {}
    }

    pc.ontrack = event => {
      const stream = event.streams && event.streams[0] ? event.streams[0] : (typeof MediaStream !== 'undefined' ? new MediaStream([event.track]) : null)
      if (audioEl && stream) {
        audioEl.srcObject = stream
        audioEl.muted = this.isDeafened
        const playPromise = audioEl.play ? audioEl.play() : null
        if (playPromise !== null && playPromise !== undefined) {
          playPromise.catch(error => {
            console.warn(`[voice] Peer ${id} audio autoplay blocked, unlocking on interaction:`, error)
            const unlock = () => {
              if (audioEl.srcObject && !this.isDeafened) {
                audioEl.play().catch(() => {})
              }
              if (typeof window !== 'undefined') {
                window.removeEventListener('click', unlock)
                window.removeEventListener('touchstart', unlock)
                window.removeEventListener('keydown', unlock)
              }
            }
            if (typeof window !== 'undefined') {
              window.addEventListener('click', unlock, { passive: true, once: true })
              window.addEventListener('touchstart', unlock, { passive: true, once: true })
              window.addEventListener('keydown', unlock, { passive: true, once: true })
            }
          })
        }
      }
      if (stream) {
        this.monitorRemoteStream(id, stream)
      }
    }

    pc.onicecandidate = event => {
      if (event.candidate) {
        this.sendSignal(id, {
          type: 'voice-candidate',
          senderCid: this.myCid,
          candidate: event.candidate,
        })
      }
    }

    pc.onconnectionstatechange = () => {
      this.onConnectionStateChange(id, pc.connectionState)
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removePeer(id, pc)
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        this.removePeer(id, pc)
      }
    }

    return peer
  }

  removePeer(peerCid, expectedPc) {
    const id = String(peerCid)
    const peer = this.peers.get(id)
    if (!peer || (expectedPc && peer.pc !== expectedPc)) return

    this.peers.delete(id)
    if (peer.analyserInterval) clearInterval(peer.analyserInterval)

    try {
      if (peer.audioEl) {
        peer.audioEl.srcObject = null
        if (typeof peer.audioEl.remove === 'function') peer.audioEl.remove()
      }
    } catch (_) {}

    try { peer.pc.close() } catch (_) {}
    this.onSpeaking(id, false)
  }

  async flushCandidates(peer) {
    if (!peer.pc.remoteDescription) return
    for (const candidate of peer.pendingCandidates.splice(0)) {
      try {
        await peer.pc.addIceCandidate(candidate)
      } catch (error) {
        console.warn('[voice] Unable to add queued ICE candidate:', error)
      }
    }
  }

  async callPeer(peerCid) {
    const id = String(peerCid)
    if (!id || id === this.myCid) return

    let peer = this.peers.get(id)
    if (!peer) {
      peer = this.createPeer(id)
      if (!peer) return
    }

    // If we have a local mic stream, ensure all tracks are added
    if (this.localStream) {
      const senders = peer.pc.getSenders ? peer.pc.getSenders() : []
      for (const track of this.localStream.getTracks()) {
        if (!senders.some(s => s.track === track)) {
          try { peer.pc.addTrack(track, this.localStream) } catch (_) {}
        }
      }
    }

    const { pc } = peer
    if (peer.makingOffer || pc.signalingState !== 'stable') return

    try {
      peer.makingOffer = true
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.sendSignal(id, {
        type: 'voice-offer',
        senderCid: this.myCid,
        sdp: pc.localDescription,
      })
    } catch (error) {
      console.warn(`[voice] callPeer offer failed for ${id}:`, error)
    } finally {
      peer.makingOffer = false
    }
  }

  async handleSignal(senderCid, signal) {
    const id = String(senderCid || signal?.senderCid || '')
    if (!id || id === this.myCid || !signal) return

    let peer = this.peers.get(id)
    if (!peer) {
      peer = this.createPeer(id)
      if (!peer) return
    }
    const { pc } = peer

    try {
      if (signal.type === 'voice-offer') {
        const isPolite = this.shouldInitiate(id)
        const collision = peer.makingOffer || pc.signalingState !== 'stable'

        if (collision && !isPolite) {
          // Impolite peer ignores colliding offer
          return
        }

        if (collision && isPolite) {
          try {
            await pc.setLocalDescription({ type: 'rollback' })
          } catch (_) {}
        }

        await pc.setRemoteDescription(signal.sdp)
        await this.flushCandidates(peer)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        this.sendSignal(id, {
          type: 'voice-answer',
          senderCid: this.myCid,
          sdp: pc.localDescription,
        })
      } else if (signal.type === 'voice-answer') {
        if (pc.signalingState !== 'have-local-offer') return
        await pc.setRemoteDescription(signal.sdp)
        await this.flushCandidates(peer)
      } else if (signal.type === 'voice-candidate' && signal.candidate) {
        const candidate = new RTCIceCandidate(signal.candidate)
        if (!pc.remoteDescription) {
          peer.pendingCandidates.push(candidate)
        } else {
          await pc.addIceCandidate(candidate).catch(() => {})
        }
      }
    } catch (error) {
      console.warn(`[voice] Signaling processing failed for peer ${id}:`, error)
      if (pc.connectionState === 'failed' || pc.signalingState === 'closed') {
        this.removePeer(id, pc)
      }
    }
  }

  stop() {
    this.isActive = false
    this.isMuted = true
    if (this.activityInterval) clearInterval(this.activityInterval)
    this.activityInterval = null

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop())
      this.localStream = null
    }

    this.onSpeaking(this.myCid, false)

    // Remove local tracks from peer connections so listeners know we stopped speaking
    for (const [peerId, peer] of this.peers.entries()) {
      try {
        if (peer.pc.getSenders) {
          peer.pc.getSenders().forEach(sender => {
            try { peer.pc.removeTrack(sender) } catch (_) {}
          })
        }
      } catch (_) {}
    }
  }

  destroy() {
    this.stop()
    if (this.audioCtx) {
      try { this.audioCtx.close().catch(() => {}) } catch (_) {}
      this.audioCtx = null
    }
    for (const peerCid of [...this.peers.keys()]) {
      this.removePeer(peerCid)
    }
  }
}

