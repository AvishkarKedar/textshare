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

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:global.stun.twilio.com:3478" },
  { urls: "stun:stun.services.mozilla.com" },
];

export interface VoiceSignal {
  type: "voice-offer" | "voice-answer" | "voice-candidate";
  senderCid: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface PeerConnectionEntry {
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement | { muted: boolean; srcObject: MediaStream | null; play: () => Promise<void>; pause: () => void; remove: () => void };
  pendingCandidates: RTCIceCandidate[];
  makingOffer: boolean;
  isSpeaking: boolean;
  analyserInterval: ReturnType<typeof setInterval> | null;
}

export class VoiceMesh {
  myCid: string;
  sendSignal: (targetCid: string, signal: VoiceSignal) => void;
  rtcConfig: RTCConfiguration;
  localStream: MediaStream | null = null;
  peers = new Map<string, PeerConnectionEntry>();
  isMuted = true;
  isDeafened = false;
  isActive = false; // whether local mic is captured and broadcasting
  audioCtx: AudioContext | null = null;
  activityInterval: ReturnType<typeof setInterval> | null = null;
  onSpeaking: (cid: string, speaking: boolean) => void = () => {};
  onLevel: (level: number) => void = () => {};
  onConnectionStateChange: (cid: string, state: RTCPeerConnectionState) => void = () => {};

  constructor(myCid: string, sendSignal: (targetCid: string, signal: VoiceSignal) => void, options: { iceServers?: RTCIceServer[] } = {}) {
    this.myCid = String(myCid);
    this.sendSignal = sendSignal;
    this.rtcConfig = { iceServers: options.iceServers || DEFAULT_ICE_SERVERS };
  }

  // Deterministic polite peer resolution (lexicographical comparison)
  shouldInitiate(peerCid: string): boolean {
    return this.myCid.localeCompare(String(peerCid)) < 0;
  }

  getAudioContext(): AudioContext | null {
    if (!this.audioCtx && typeof window !== "undefined") {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        try {
          this.audioCtx = new AudioContextClass();
        } catch (_) {}
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  async start(): Promise<boolean> {
    if (this.isActive && this.localStream) return true;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const error = new Error("Microphone access is unsupported or requires HTTPS.");
      error.name = "NotSupportedError";
      throw error;
    }

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    this.isActive = true;
    this.setMuted(false);
    this.monitorAudioActivity();

    // Add local tracks to any existing peer connections
    for (const [peerId, peer] of this.peers.entries()) {
      try {
        const senders = peer.pc.getSenders ? peer.pc.getSenders() : [];
        for (const track of this.localStream.getTracks()) {
          if (!senders.some((s) => s.track === track)) {
            peer.pc.addTrack(track, this.localStream);
          }
        }
        if (peer.pc.signalingState === "stable") {
          this.callPeer(peerId);
        }
      } catch (err) {
        console.warn(`[voice] Error attaching local tracks to peer ${peerId}:`, err);
      }
    }

    return true;
  }

  setMuted(muted: boolean) {
    this.isMuted = Boolean(muted);
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isMuted;
      });
    }
    if (this.isMuted) {
      this.onSpeaking(this.myCid, false);
      this.onLevel(0);
    }
  }

  setDeafened(deafened: boolean) {
    this.isDeafened = Boolean(deafened);
    for (const peer of this.peers.values()) {
      try {
        if (peer.audioEl) {
          peer.audioEl.muted = this.isDeafened;
        }
      } catch (_) {}
    }
  }

  isPeerSpeaking(peerCid: string): boolean {
    const peer = this.peers.get(String(peerCid));
    return Boolean(peer?.isSpeaking);
  }

  monitorAudioActivity() {
    if (!this.localStream) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const analyser = ctx.createAnalyser();
      const source = ctx.createMediaStreamSource(this.localStream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const buffer = new Uint8Array(analyser.frequencyBinCount);

      if (this.activityInterval) clearInterval(this.activityInterval);
      this.activityInterval = setInterval(() => {
        if (this.isMuted || !this.isActive || !this.localStream) {
          this.onSpeaking(this.myCid, false);
          this.onLevel(0);
          return;
        }
        analyser.getByteFrequencyData(buffer);
        const avg = buffer.reduce((a, b) => a + b, 0) / buffer.length;
        const normalizedLevel = Math.min(100, Math.round((avg / 128) * 100));
        this.onLevel(normalizedLevel);
        this.onSpeaking(this.myCid, avg > 20);
      }, 100);
    } catch (error) {
      console.warn("[voice] Local voice activity monitoring unavailable:", error);
    }
  }

  monitorRemoteStream(peerCid: string, stream: MediaStream) {
    const id = String(peerCid);
    const peer = this.peers.get(id);
    if (!peer || !stream) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      if (peer.analyserInterval) clearInterval(peer.analyserInterval);
      const analyser = ctx.createAnalyser();
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const buffer = new Uint8Array(analyser.frequencyBinCount);

      peer.analyserInterval = setInterval(() => {
        if (this.isDeafened || !peer.pc || peer.pc.connectionState === "closed") {
          if (peer.isSpeaking) {
            peer.isSpeaking = false;
            this.onSpeaking(id, false);
          }
          return;
        }
        analyser.getByteFrequencyData(buffer);
        const avg = buffer.reduce((a, b) => a + b, 0) / buffer.length;
        const isSpeaking = avg > 18;
        if (peer.isSpeaking !== isSpeaking) {
          peer.isSpeaking = isSpeaking;
          this.onSpeaking(id, isSpeaking);
        }
      }, 120);
    } catch (err) {
      console.warn(`[voice] Remote stream monitoring failed for ${id}:`, err);
    }
  }

  createPeer(peerCid: string): PeerConnectionEntry | null {
    const id = String(peerCid);
    if (this.peers.has(id)) return this.peers.get(id)!;

    let pc: RTCPeerConnection;
    try {
      pc = new RTCPeerConnection(this.rtcConfig);
    } catch (err) {
      console.error("[voice] Failed to construct RTCPeerConnection:", err);
      return null;
    }

    let audioEl: HTMLAudioElement | { muted: boolean; srcObject: MediaStream | null; play: () => Promise<void>; pause: () => void; remove: () => void };
    if (typeof document !== "undefined") {
      const el = document.createElement("audio");
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      el.setAttribute("autoplay", "true");
      el.muted = this.isDeafened;
      el.style.display = "none";
      try {
        if (document.body && !document.body.contains(el)) {
          document.body.appendChild(el);
        }
      } catch (_) {}
      audioEl = el;
    } else {
      audioEl = { muted: this.isDeafened, srcObject: null, play: async () => {}, pause: () => {}, remove: () => {} };
    }

    const peer: PeerConnectionEntry = {
      pc,
      audioEl,
      pendingCandidates: [],
      makingOffer: false,
      isSpeaking: false,
      analyserInterval: null,
    };
    this.peers.set(id, peer);

    // If we have a local microphone stream, add its audio tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, this.localStream!);
        } catch (_) {}
      });
    } else {
      try {
        pc.addTransceiver("audio", { direction: "recvonly" });
      } catch (_) {}
    }

    pc.ontrack = (event) => {
      const stream = event.streams && event.streams[0] ? event.streams[0] : (typeof MediaStream !== "undefined" ? new MediaStream([event.track]) : null);
      if (audioEl && stream) {
        if ("srcObject" in audioEl) {
          audioEl.srcObject = stream;
          audioEl.muted = this.isDeafened;
          const playPromise = audioEl.play ? audioEl.play() : null;
          if (playPromise !== null && playPromise !== undefined) {
            playPromise.catch((error) => {
              console.warn(`[voice] Peer ${id} audio autoplay blocked, unlocking on interaction:`, error);
              const unlock = () => {
                if (audioEl.srcObject && !this.isDeafened && audioEl.play) {
                  audioEl.play().catch(() => {});
                }
                if (typeof window !== "undefined") {
                  window.removeEventListener("click", unlock);
                  window.removeEventListener("touchstart", unlock);
                  window.removeEventListener("keydown", unlock);
                }
              };
              if (typeof window !== "undefined") {
                window.addEventListener("click", unlock, { passive: true, once: true });
                window.addEventListener("touchstart", unlock, { passive: true, once: true });
                window.addEventListener("keydown", unlock, { passive: true, once: true });
              }
            });
          }
        }
      }
      if (stream) {
        this.monitorRemoteStream(id, stream);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(id, {
          type: "voice-candidate",
          senderCid: this.myCid,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      this.onConnectionStateChange(id, pc.connectionState);
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.removePeer(id, pc);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
        this.removePeer(id, pc);
      }
    };

    return peer;
  }

  removePeer(peerCid: string, expectedPc?: RTCPeerConnection) {
    const id = String(peerCid);
    const peer = this.peers.get(id);
    if (!peer || (expectedPc && peer.pc !== expectedPc)) return;

    this.peers.delete(id);
    if (peer.analyserInterval) clearInterval(peer.analyserInterval);

    try {
      if (peer.audioEl) {
        peer.audioEl.srcObject = null;
        if (typeof peer.audioEl.remove === "function") peer.audioEl.remove();
      }
    } catch (_) {}

    try {
      peer.pc.close();
    } catch (_) {}
    this.onSpeaking(id, false);
  }

  async flushCandidates(peer: PeerConnectionEntry) {
    if (!peer.pc.remoteDescription) return;
    for (const candidate of peer.pendingCandidates.splice(0)) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (error) {
        console.warn("[voice] Unable to add queued ICE candidate:", error);
      }
    }
  }

  async callPeer(peerCid: string) {
    const id = String(peerCid);
    if (!id || id === this.myCid) return;

    let peer: PeerConnectionEntry | null | undefined = this.peers.get(id);
    if (!peer) {
      peer = this.createPeer(id);
      if (!peer) return;
    }

    if (this.localStream) {
      const senders = peer.pc.getSenders ? peer.pc.getSenders() : [];
      for (const track of this.localStream.getTracks()) {
        if (!senders.some((s) => s.track === track)) {
          try {
            peer.pc.addTrack(track, this.localStream);
          } catch (_) {}
        }
      }
    }

    const { pc } = peer;
    if (peer.makingOffer || pc.signalingState !== "stable") return;

    try {
      peer.makingOffer = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendSignal(id, {
        type: "voice-offer",
        senderCid: this.myCid,
        sdp: pc.localDescription ?? offer,
      });
    } catch (error) {
      console.warn(`[voice] callPeer offer failed for ${id}:`, error);
    } finally {
      peer.makingOffer = false;
    }
  }

  async handleSignal(senderCid: string, signal: VoiceSignal) {
    const id = String(senderCid || signal?.senderCid || "");
    if (!id || id === this.myCid || !signal) return;

    let peer: PeerConnectionEntry | null | undefined = this.peers.get(id);
    if (!peer) {
      peer = this.createPeer(id);
      if (!peer) return;
    }
    const { pc } = peer;

    try {
      if (signal.type === "voice-offer" && signal.sdp) {
        const isPolite = this.shouldInitiate(id);
        const collision = peer.makingOffer || pc.signalingState !== "stable";

        if (collision && !isPolite) {
          return;
        }

        if (collision && isPolite) {
          try {
            await pc.setLocalDescription({ type: "rollback" });
          } catch (_) {}
        }

        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await this.flushCandidates(peer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal(id, {
          type: "voice-answer",
          senderCid: this.myCid,
          sdp: pc.localDescription ?? answer,
        });
      } else if (signal.type === "voice-answer" && signal.sdp) {
        if (pc.signalingState !== "have-local-offer") return;
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await this.flushCandidates(peer);
      } else if (signal.type === "voice-candidate" && signal.candidate) {
        const candidate = new RTCIceCandidate(signal.candidate);
        if (!pc.remoteDescription) {
          peer.pendingCandidates.push(candidate);
        } else {
          await pc.addIceCandidate(candidate).catch(() => {});
        }
      }
    } catch (error) {
      console.warn(`[voice] Signaling processing failed for peer ${id}:`, error);
      if (pc.connectionState === "failed" || pc.signalingState === "closed") {
        this.removePeer(id, pc);
      }
    }
  }

  stop() {
    this.isActive = false;
    this.isMuted = true;
    if (this.activityInterval) clearInterval(this.activityInterval);
    this.activityInterval = null;

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.onSpeaking(this.myCid, false);
    this.onLevel(0);

    for (const [, peer] of this.peers.entries()) {
      try {
        if (peer.pc.getSenders) {
          peer.pc.getSenders().forEach((sender) => {
            try {
              peer.pc.removeTrack(sender);
            } catch (_) {}
          });
        }
      } catch (_) {}
    }
  }

  destroy() {
    this.stop();
    if (this.audioCtx) {
      try {
        this.audioCtx.close().catch(() => {});
      } catch (_) {}
      this.audioCtx = null;
    }
    for (const peerCid of [...this.peers.keys()]) {
      this.removePeer(peerCid);
    }
  }
}
