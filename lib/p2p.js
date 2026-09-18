/**
 * WebRTC P2P DataChannel acceleration.
 * Uses deterministic initiators, queues early ICE candidates, and removes
 * failed peers so a later presence update can reconnect them.
 */

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export class P2PMesh {
  constructor(myCid, sendSignal, options = {}) {
    this.myCid = String(myCid)
    this.sendSignal = sendSignal
    this.rtcConfig = { iceServers: options.iceServers || DEFAULT_ICE_SERVERS }
    this.peers = new Map()
    this.onMessage = () => {}
    this.onConnectionStateChange = () => {}
  }

  shouldInitiate(peerCid) {
    return this.myCid.localeCompare(String(peerCid)) < 0
  }

  createPeer(peerCid) {
    const id = String(peerCid)
    const pc = new RTCPeerConnection(this.rtcConfig)
    const peer = { pc, dc: null, pendingCandidates: [], makingOffer: false }
    this.peers.set(id, peer)

    pc.onicecandidate = event => {
      if (event.candidate) this.sendSignal(id, { type: 'candidate', senderCid: this.myCid, candidate: event.candidate })
    }
    pc.ondatachannel = event => this.setupDataChannel(id, event.channel)
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      this.onConnectionStateChange(id, state)
      if (state === 'failed' || state === 'closed') this.removePeer(id, pc)
    }
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        this.removePeer(id, pc)
      }
    }
    return peer
  }

  removePeer(peerCid, expectedPc) {
    const peer = this.peers.get(peerCid)
    if (!peer || (expectedPc && peer.pc !== expectedPc)) return
    this.peers.delete(peerCid)
    try { peer.dc?.close() } catch (_) {}
    try { peer.pc?.close() } catch (_) {}
  }

  async flushCandidates(peer) {
    if (!peer.pc.remoteDescription) return
    const queued = peer.pendingCandidates.splice(0)
    for (const candidate of queued) {
      try { await peer.pc.addIceCandidate(candidate) }
      catch (error) { console.warn('Unable to add queued P2P ICE candidate:', error) }
    }
  }

  async connectToPeer(peerCid) {
    const id = String(peerCid)
    if (id === this.myCid || this.peers.has(id) || !this.shouldInitiate(id)) return
    const peer = this.createPeer(id)
    const dc = peer.pc.createDataChannel('anonshare-sync', { ordered: true })
    this.setupDataChannel(id, dc)

    try {
      peer.makingOffer = true
      await peer.pc.setLocalDescription(await peer.pc.createOffer())
      this.sendSignal(id, { type: 'offer', senderCid: this.myCid, sdp: peer.pc.localDescription })
    } catch (error) {
      this.removePeer(id, peer.pc)
      throw error
    } finally {
      peer.makingOffer = false
    }
  }

  async handleSignal(senderCid, signal) {
    const id = String(senderCid || signal?.senderCid || '')
    if (id === this.myCid || !id || !signal || typeof signal.type !== 'string') return
    let peer = this.peers.get(id)
    if (!peer) peer = this.createPeer(id)
    const { pc } = peer

    try {
      if (signal.type === 'offer') {
        const collision = peer.makingOffer || pc.signalingState !== 'stable'
        if (collision && this.shouldInitiate(id)) return
        if (collision) await pc.setLocalDescription({ type: 'rollback' })
        await pc.setRemoteDescription(signal.sdp)
        await this.flushCandidates(peer)
        await pc.setLocalDescription(await pc.createAnswer())
        this.sendSignal(id, { type: 'answer', senderCid: this.myCid, sdp: pc.localDescription })
      } else if (signal.type === 'answer') {
        if (pc.signalingState !== 'have-local-offer') return
        await pc.setRemoteDescription(signal.sdp)
        await this.flushCandidates(peer)
      } else if (signal.type === 'candidate' && signal.candidate) {
        const candidate = new RTCIceCandidate(signal.candidate)
        if (!pc.remoteDescription) peer.pendingCandidates.push(candidate)
        else await pc.addIceCandidate(candidate)
      }
    } catch (error) {
      console.warn(`P2P signaling failed for peer ${id}:`, error)
      if (pc.connectionState === 'failed' || pc.signalingState === 'closed') this.removePeer(id, pc)
    }
  }

  setupDataChannel(peerCid, dc) {
    const peer = this.peers.get(peerCid)
    if (!peer) return
    peer.dc = dc
    dc.onmessage = event => this.onMessage(peerCid, event.data)
    dc.onclose = () => this.removePeer(peerCid, peer.pc)
    dc.onerror = error => console.warn(`P2P data channel error for peer ${peerCid}:`, error)
  }

  broadcast(data) {
    for (const { dc } of this.peers.values()) {
      if (dc?.readyState === 'open') {
        try { dc.send(data) } catch (error) { console.warn('P2P send failed:', error) }
      }
    }
  }

  destroy() {
    for (const peerCid of [...this.peers.keys()]) this.removePeer(peerCid)
  }
}
