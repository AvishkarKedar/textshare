/**
 * Ephemeral WebRTC Voice Chat / Walkie-Talkie for AnonShare
 * Zero-knowledge peer-to-peer audio mesh. No server recording or storage.
 */

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export class VoiceMesh {
  constructor(myCid, sendSignal) {
    this.myCid = myCid
    this.sendSignal = sendSignal
    this.localStream = null
    this.peers = new Map() // peerCid -> { pc, audioEl }
    this.isMuted = true
    this.isActive = false
    this.onSpeaking = () => {} // (cid, isSpeaking) => void
  }

  async start() {
    if (this.isActive) return true
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error('Microphone access is not supported by your browser or requires a secure HTTPS connection.')
      err.name = 'NotSupportedError'
      throw err
    }
    try {
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
      return true
    } catch (e) {
      console.warn('Microphone access error:', e)
      throw e
    }
  }

  setMuted(muted) {
    this.isMuted = muted
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => { t.enabled = !muted })
    }
    this.onSpeaking(this.myCid, !muted)
  }

  monitorAudioActivity() {
    if (!this.localStream || !window.AudioContext) return
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = audioCtx.createAnalyser()
      const mic = audioCtx.createMediaStreamSource(this.localStream)
      mic.connect(analyser)
      analyser.fftSize = 256
      const buffer = new Uint8Array(analyser.frequencyBinCount)

      setInterval(() => {
        if (this.isMuted || !this.isActive) return
        analyser.getByteFrequencyData(buffer)
        const avg = buffer.reduce((a, b) => a + b, 0) / buffer.length
        const isSpeaking = avg > 25
        this.onSpeaking(this.myCid, isSpeaking)
      }, 200)
    } catch (e) {}
  }

  async callPeer(peerCid) {
    if (!this.isActive || !this.localStream || this.peers.has(peerCid) || peerCid === this.myCid) return
    const pc = new RTCPeerConnection(RTC_CONFIG)
    this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream))

    const audioEl = new Audio()
    audioEl.autoplay = true
    pc.ontrack = e => { audioEl.srcObject = e.streams[0] }

    this.peers.set(peerCid, { pc, audioEl })

    pc.onicecandidate = e => {
      if (e.candidate) {
        this.sendSignal(peerCid, { type: 'voice-candidate', candidate: e.candidate })
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    this.sendSignal(peerCid, { type: 'voice-offer', sdp: offer })
  }

  async handleSignal(senderCid, signal) {
    if (!this.isActive || senderCid === this.myCid) return

    let peer = this.peers.get(senderCid)
    if (!peer) {
      const pc = new RTCPeerConnection(RTC_CONFIG)
      if (this.localStream) {
        this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream))
      }
      const audioEl = new Audio()
      audioEl.autoplay = true
      pc.ontrack = e => { audioEl.srcObject = e.streams[0] }
      pc.onicecandidate = e => {
        if (e.candidate) {
          this.sendSignal(senderCid, { type: 'voice-candidate', candidate: e.candidate })
        }
      }
      peer = { pc, audioEl }
      this.peers.set(senderCid, peer)
    }

    const { pc } = peer

    if (signal.type === 'voice-offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.sendSignal(senderCid, { type: 'voice-answer', sdp: answer })
    } else if (signal.type === 'voice-answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
    } else if (signal.type === 'voice-candidate') {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate))
      } catch (e) {}
    }
  }

  stop() {
    this.isActive = false
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop())
      this.localStream = null
    }
    for (const [, { pc, audioEl }] of this.peers) {
      try { audioEl.srcObject = null } catch (e) {}
      try { pc.close() } catch (e) {}
    }
    this.peers.clear()
    this.onSpeaking(this.myCid, false)
  }
}
