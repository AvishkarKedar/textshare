/**
 * WebRTC P2P DataChannel Acceleration for AnonShare
 * Uses relay for lightweight signaling to establish direct mesh connections
 * between connected room peers for zero-latency cursor and file streaming.
 */

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export class P2PMesh {
  constructor(myCid, sendSignal) {
    this.myCid = myCid
    this.sendSignal = sendSignal // (targetCid, signal) => void
    this.peers = new Map() // peerCid -> { pc, dc }
    this.onMessage = () => {}
  }

  // Called when a peer joins or is discovered
  async connectToPeer(peerCid) {
    if (this.peers.has(peerCid) || peerCid === this.myCid) return
    const pc = new RTCPeerConnection(RTC_CONFIG)
    const dc = pc.createDataChannel('anonshare-sync', { ordered: true })
    this.setupDataChannel(peerCid, dc)

    this.peers.set(peerCid, { pc, dc })

    pc.onicecandidate = e => {
      if (e.candidate) {
        this.sendSignal(peerCid, { type: 'candidate', candidate: e.candidate })
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    this.sendSignal(peerCid, { type: 'offer', sdp: offer })
  }

  // Handle incoming signaling message from relay
  async handleSignal(senderCid, signal) {
    if (senderCid === this.myCid) return

    let peer = this.peers.get(senderCid)
    if (!peer) {
      const pc = new RTCPeerConnection(RTC_CONFIG)
      pc.ondatachannel = e => {
        this.setupDataChannel(senderCid, e.channel)
      }
      pc.onicecandidate = e => {
        if (e.candidate) {
          this.sendSignal(senderCid, { type: 'candidate', candidate: e.candidate })
        }
      }
      peer = { pc, dc: null }
      this.peers.set(senderCid, peer)
    }

    const { pc } = peer

    if (signal.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.sendSignal(senderCid, { type: 'answer', sdp: answer })
    } else if (signal.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
    } else if (signal.type === 'candidate') {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate))
      } catch (e) {}
    }
  }

  setupDataChannel(peerCid, dc) {
    const peer = this.peers.get(peerCid)
    if (peer) peer.dc = dc

    dc.onopen = () => {
      // Peer direct connection active
    }

    dc.onmessage = e => {
      this.onMessage(peerCid, e.data)
    }

    dc.onclose = () => {
      this.peers.delete(peerCid)
    }
  }

  broadcast(data) {
    for (const [, { dc }] of this.peers) {
      if (dc && dc.readyState === 'open') {
        try { dc.send(data) } catch (e) {}
      }
    }
  }

  destroy() {
    for (const [, { pc, dc }] of this.peers) {
      try { dc?.close() } catch (e) {}
      try { pc?.close() } catch (e) {}
    }
    this.peers.clear()
  }
}
