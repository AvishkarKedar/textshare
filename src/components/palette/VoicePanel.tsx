"use client";

import { useEffect, useState, useRef } from "react";
import { useAnon } from "@/lib/store";
import { voiceEngine, type VoiceState } from "@/lib/voice";
import {
  X,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  ScreenShare,
  ScreenShareOff,
  ShieldCheck,
  Maximize2,
  Users,
  Activity,
  Sparkles,
} from "lucide-react";

export function VoicePanel() {
  const s = useAnon();
  const [vState, setVState] = useState<VoiceState>(voiceEngine.getState());
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    return voiceEngine.subscribe(setVState);
  }, []);

  // Bind video stream to screen share preview element
  useEffect(() => {
    const video = screenVideoRef.current;
    if (!video) return;
    const stream = vState.screenStream || vState.remoteScreenStream;
    if (stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
  }, [vState.screenStream, vState.remoteScreenStream]);

  if (!s.voiceOpen) return null;

  const onlinePeers = s.participants.filter((p) => p.online);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in">
      {/* backdrop click */}
      <div className="absolute inset-0" onClick={() => s.toggleVoice()} />

      <div className="relative flex h-full w-full max-w-md flex-col hairline-l bg-[var(--anon-panel)] p-4 shadow-2xl animate-in slide-in-from-right">
        {/* header */}
        <div className="flex items-center justify-between hairline-b pb-3">
          <div className="flex items-center gap-2">
            <Radio className={`h-4 w-4 ${vState.connected ? "text-[var(--anon-ok)] anim-beat" : "anon-accent"}`} />
            <h2 className="anon-mono text-sm font-semibold anon-fg">Voice & Screen Mesh</h2>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`anon-mono text-[10px] px-2 py-0.5 rounded-full ${
                vState.connected
                  ? "bg-[var(--anon-ok)]/20 text-[var(--anon-ok)]"
                  : "bg-[var(--anon-mut)]/20 anon-mut"
              }`}
            >
              {vState.connected ? "DTLS-SRTP Live" : "Disconnected"}
            </span>
            <button
              onClick={() => s.toggleVoice()}
              className="p-1 rounded anon-mut hover:anon-fg transition-colors"
              aria-label="Close voice panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto anon-scroll py-4 space-y-5">
          {/* Connection state CTA */}
          {!vState.connected ? (
            <div className="flex flex-col items-center justify-center p-6 text-center hairline-all bg-[var(--anon-raise)] rounded-lg space-y-3">
              <div className="h-12 w-12 rounded-full bg-[var(--anon-accent)]/20 flex items-center justify-center text-[var(--anon-accent)]">
                <Mic className="h-6 w-6" />
              </div>
              <div>
                <h3 className="anon-mono text-sm font-semibold anon-fg">Join Voice Room</h3>
                <p className="anon-mono text-xs anon-mut mt-1">
                  End-to-end encrypted peer-to-peer audio mesh with zero server recording.
                </p>
              </div>
              <button
                onClick={() => voiceEngine.connect()}
                disabled={vState.connecting}
                className="w-full h-10 anon-mono text-xs font-semibold bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] hover:brightness-110 active:translate-y-px transition-all rounded"
              >
                {vState.connecting ? "Connecting audio…" : "Connect Voice & Mic"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Mic volume meter */}
              <div className="p-3 hairline-all bg-[var(--anon-raise)] rounded-lg space-y-2">
                <div className="flex items-center justify-between anon-mono text-xs">
                  <span className="anon-mut flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 anon-accent" /> Mic Volume
                  </span>
                  <span className={vState.speaking ? "text-[var(--anon-ok)] font-semibold" : "anon-dim"}>
                    {vState.muted ? "Muted" : vState.speaking ? "Speaking" : `${vState.micLevel}%`}
                  </span>
                </div>

                {/* Level progress bar */}
                <div className="h-2.5 w-full bg-[var(--anon-bg)] rounded-full overflow-hidden p-0.5 hairline-all">
                  <div
                    className="h-full rounded-full transition-all duration-75"
                    style={{
                      width: `${vState.muted ? 0 : vState.micLevel}%`,
                      background:
                        vState.micLevel > 65
                          ? "var(--anon-danger)"
                          : vState.micLevel > 30
                            ? "var(--anon-warn)"
                            : "var(--anon-ok)",
                    }}
                  />
                </div>
              </div>

              {/* Action Controls Grid */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => voiceEngine.toggleMute()}
                  className={`flex flex-col items-center justify-center p-3 rounded hairline-all transition-colors ${
                    vState.muted
                      ? "bg-[var(--anon-danger)]/20 text-[var(--anon-danger)] border-[var(--anon-danger)]/50"
                      : "bg-[var(--anon-raise)] anon-fg hover:bg-[var(--anon-panel)]"
                  }`}
                  title="Toggle Mute (M)"
                >
                  {vState.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  <span className="anon-mono text-[10px] mt-1">{vState.muted ? "Unmute" : "Mute"}</span>
                </button>

                <button
                  onClick={() => voiceEngine.toggleDeafen()}
                  className={`flex flex-col items-center justify-center p-3 rounded hairline-all transition-colors ${
                    vState.deafened
                      ? "bg-[var(--anon-warn)]/20 text-[var(--anon-warn)] border-[var(--anon-warn)]/50"
                      : "bg-[var(--anon-raise)] anon-fg hover:bg-[var(--anon-panel)]"
                  }`}
                  title="Toggle Deafen (D)"
                >
                  {vState.deafened ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  <span className="anon-mono text-[10px] mt-1">{vState.deafened ? "Undeafen" : "Deafen"}</span>
                </button>

                <button
                  onClick={() => voiceEngine.toggleScreenShare()}
                  className={`flex flex-col items-center justify-center p-3 rounded hairline-all transition-colors ${
                    vState.screenSharing
                      ? "bg-[var(--anon-accent)]/20 text-[var(--anon-accent)] border-[var(--anon-accent)]/50 font-semibold"
                      : "bg-[var(--anon-raise)] anon-fg hover:bg-[var(--anon-panel)]"
                  }`}
                  title="Share Screen"
                >
                  {vState.screenSharing ? <ScreenShareOff className="h-5 w-5" /> : <ScreenShare className="h-5 w-5" />}
                  <span className="anon-mono text-[10px] mt-1">{vState.screenSharing ? "Stop Share" : "Share"}</span>
                </button>
              </div>

              {/* Push To Talk big button */}
              <button
                onPointerDown={() => voiceEngine.setPushToTalk(true)}
                onPointerUp={() => voiceEngine.setPushToTalk(false)}
                onPointerLeave={() => voiceEngine.setPushToTalk(false)}
                className={`w-full h-14 anon-mono text-xs font-semibold rounded hairline-all select-none transition-all ${
                  vState.pushToTalk
                    ? "bg-[var(--anon-ok)] text-black font-bold shadow-lg"
                    : "bg-[var(--anon-raise)] anon-fg hover:bg-[var(--anon-panel)]"
                }`}
              >
                {vState.pushToTalk ? "Transmitting Audio… (Release to Mute)" : "Hold to Talk (PTT)"}
              </button>

              {/* Screen share video monitor if active */}
              {(vState.screenStream || vState.remoteScreenStream) && (
                <div className="p-3 hairline-all bg-[var(--anon-raise)] rounded-lg space-y-2">
                  <div className="flex items-center justify-between anon-mono text-xs anon-fg">
                    <span className="flex items-center gap-1.5">
                      <ScreenShare className="h-3.5 w-3.5 anon-accent" /> Live Display Stream
                    </span>
                    <button
                      onClick={() => {
                        if (screenVideoRef.current?.requestFullscreen) {
                          screenVideoRef.current.requestFullscreen();
                        }
                      }}
                      className="anon-mut hover:anon-fg p-0.5"
                      title="Full screen"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="relative aspect-video w-full overflow-hidden rounded bg-black">
                    <video
                      ref={screenVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="h-full w-full object-contain"
                    />
                  </div>
                </div>
              )}

              {/* Disconnect button */}
              <button
                onClick={() => voiceEngine.disconnect()}
                className="w-full h-8 anon-mono text-xs text-[var(--anon-danger)] hover:bg-[var(--anon-danger)]/10 hairline-all rounded transition-colors"
              >
                Disconnect from Voice
              </button>
            </div>
          )}

          {/* Active Participants */}
          <div className="space-y-2">
            <div className="flex items-center justify-between anon-mono text-xs anon-dim">
              <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                <Users className="h-3 w-3" /> In Room ({onlinePeers.length})
              </span>
            </div>

            <div className="space-y-1.5">
              {onlinePeers.map((p) => {
                const isMe = p.id === "me";
                const isSpeaking = isMe ? vState.speaking : false;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2 rounded bg-[var(--anon-raise)]/60 hairline-all"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-black relative ${
                          isSpeaking ? "anim-pulse-ring" : ""
                        }`}
                        style={{ background: p.color }}
                      >
                        {p.name.slice(0, 2).toUpperCase()}
                        {isSpeaking && (
                          <span
                            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--anon-ok)]"
                          />
                        )}
                      </div>
                      <span className="anon-mono text-xs anon-fg">
                        {p.name} {isMe && "(You)"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 anon-mono text-[10px]">
                      {isMe && vState.muted ? (
                        <span className="text-[var(--anon-danger)] flex items-center gap-1">
                          <MicOff className="h-3 w-3" /> muted
                        </span>
                      ) : isSpeaking ? (
                        <span className="text-[var(--anon-ok)] flex items-center gap-1">
                          <Radio className="h-3 w-3 anim-beat" /> speaking
                        </span>
                      ) : (
                        <span className="anon-dim">idle</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Security footnote */}
          <div className="flex items-center gap-2 p-3 hairline-all bg-[var(--anon-bg)] rounded text-[11px] anon-mut">
            <ShieldCheck className="h-4 w-4 text-[var(--anon-ok)] flex-none" />
            <p className="leading-snug">
              Direct P2P WebRTC audio encrypted via DTLS-SRTP. Media packets are exchanged directly between browsers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
