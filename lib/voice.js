/**
 * Ephemeral WebRTC voice mesh with deterministic negotiation and ICE queuing.
 */

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export class VoiceMesh {
  constructor(myCid, sendSignal, options = {}) {
    this.myCid = String(myCid)
    this.sendSignal = sendSignal
    this.rtcConfig = { iceServers: options.iceServers || DEFAULT_ICE_SERVERS }
    this.localStream = null
    this.peers = new Map()
    this.isMuted = true
    this.isActive = false
    this.audioCtx = null
    this.activityInterval = null
    this.onSpeaking = () => {}
    this.onConnectionStateChange = () => {}
  }

  shouldInitiate(peerCid) { return this.myCid.localeCompare(String(peerCid)) < 0 }

  async start() {
    if (this.isActive) return true
    if (!navigator.mediaDevices?.getUserMedia) {
      const error = new Error('Microphone access is unsupported or requires HTTPS.')
      error.name = 'NotSupportedError'
      throw error
    }
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    })
    this.isActive = true
    this.setMuted(false)
    this.monitorAudioActivity()
    return true
  }

  setMuted(muted) {
    this.isMuted = muted
    this.localStream?.getAudioTracks().forEach(track => { track.enabled = !muted })
    if (muted) this.onSpeaking(this.myCid, false)
  }

  monitorAudioActivity() {
    if (!this.localStream || (!window.AudioContext && !window.webkitAudioContext)) return
    try {
      this.audioCtx?.close().catch(() => {})
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = this.audioCtx.createAnalyser()
      this.audioCtx.createMediaStreamSource(this.localStream).connect(analyser)
      analyser.fftSize = 256
      const buffer = new Uint8Array(analyser.frequencyBinCount)
      if (this.activityInterval) clearInterval(this.activityInterval)
      this.activityInterval = setInterval(() => {
        if (this.isMuted || !this.isActive) return
        analyser.getByteFrequencyData(buffer)
        this.onSpeaking(this.myCid, buffer.reduce((a, b) => a + b, 0) / buffer.length > 25)
      }, 200)
    } catch (error) { console.warn('Voice activity monitoring unavailable:', error) }
  }

  createPeer(peerCid) {
    const id = String(peerCid)
    const pc = new RTCPeerConnection(this.rtcConfig)
    const audioEl = new Audio()
    audioEl.autoplay = true
    const peer = { pc, audioEl, pendingCandidates: [], makingOffer: false }
    this.peers.set(id, peer)
    this.localStream?.getTracks().forEach(track => pc.addTrack(track, this.localStream))
    pc.ontrack = event => {
      audioEl.srcObject = event.streams[0]
      audioEl.play().catch(error => console.warn('Peer audio autoplay blocked:', error))
    }
    pc.onicecandidate = event => {
      if (event.candidate) this.sendSignal(id, { type: 'voice-candidate', candidate: event.candidate })
    }
    pc.onconnectionstatechange = () => {
      this.onConnectionStateChange(id, pc.connectionState)
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.removePeer(id, pc)
    }
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') this.removePeer(id, pc)
    }
    return peer
  }

  removePeer(peerCid, expectedPc) {
    const peer = this.peers.get(peerCid)
    if (!peer || (expectedPc && peer.pc !== expectedPc)) return
    this.peers.delete(peerCid)
    try { peer.audioEl.srcObject = null } catch (_) {}
    try { peer.pc.close() } catch (_) {}
  }

  async flushCandidates(peer) {
    if (!peer.pc.remoteDescription) return
    for (const candidate of peer.pendingCandidates.splice(0)) {
      try { await peer.pc.addIceCandidate(candidate) }
      catch (error) { console.warn('Unable to add queued voice ICE candidate:', error) }
    }
  }

  async callPeer(peerCid) {
    const id = String(peerCid)
    if (!this.isActive || !this.localStream || id === this.myCid || this.peers.has(id) || !this.shouldInitiate(id)) return
    const peer = this.createPeer(id)
    try {
      peer.makingOffer = true
      await peer.pc.setLocalDescription(await peer.pc.createOffer())
      this.sendSignal(id, { type: 'voice-offer', sdp: peer.pc.localDescription })
    } catch (error) {
      this.removePeer(id, peer.pc)
      throw error
    } finally { peer.makingOffer = false }
  }

  async handleSignal(senderCid, signal) {
    const id = String(senderCid)
    if (!this.isActive || id === this.myCid || !signal) return
    let peer = this.peers.get(id)
    if (!peer) peer = this.createPeer(id)
    const { pc } = peer
    try {
      if (signal.type === 'voice-offer') {
        const collision = peer.makingOffer || pc.signalingState !== 'stable'
        if (collision && this.shouldInitiate(id)) return
        if (collision) await pc.setLocalDescription({ type: 'rollback' })
        await pc.setRemoteDescription(signal.sdp)
        await this.flushCandidates(peer)
        await pc.setLocalDescription(await pc.createAnswer())
        this.sendSignal(id, { type: 'voice-answer', sdp: pc.localDescription })
      } else if (signal.type === 'voice-answer') {
        if (pc.signalingState !== 'have-local-offer') return
        await pc.setRemoteDescription(signal.sdp)
        await this.flushCandidates(peer)
      } else if (signal.type === 'voice-candidate' && signal.candidate) {
        const candidate = new RTCIceCandidate(signal.candidate)
        if (!pc.remoteDescription) peer.pendingCandidates.push(candidate)
        else await pc.addIceCandidate(candidate)
      }
    } catch (error) {
      console.warn(`Voice signaling failed for peer ${id}:`, error)
      if (pc.connectionState === 'failed' || pc.signalingState === 'closed') this.removePeer(id, pc)
    }
  }

  stop() {
    this.isActive = false
    this.isMuted = true
    if (this.activityInterval) clearInterval(this.activityInterval)
    this.activityInterval = null
    this.audioCtx?.close().catch(() => {})
    this.audioCtx = null
    this.localStream?.getTracks().forEach(track => track.stop())
    this.localStream = null
    for (const peerCid of [...this.peers.keys()]) this.removePeer(peerCid)
    this.onSpeaking(this.myCid, false)
  }
}
