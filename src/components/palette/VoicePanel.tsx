"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Mic,
  MicOff,
  Headphones,
  Volume2,
  Radio,
  Activity,
  Users,
} from "lucide-react";
import { useAnon } from "@/lib/store";
import { initials } from "@/lib/themes";
import {
  joinVoiceMesh,
  leaveVoiceMesh,
  setVoiceMute,
  setVoiceDeafen,
  setVoicePushToTalk,
} from "@/lib/use-sync";
import { toast } from "sonner";

export function VoicePanel() {
  const s = useAnon();
  if (!s.voiceOpen) return null;
  const v = s.voice;

  const handleJoin = async () => {
    try {
      await joinVoiceMesh();
      toast.success("Joined voice mesh", {
        description: "Connected via WebRTC DTLS-SRTP P2P",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Please allow microphone access in your browser.";
      toast.error("Microphone access failed", { description: msg });
    }
  };

  const handleDisconnect = () => {
    leaveVoiceMesh();
    toast.info("Left voice mesh");
  };

  const handleToggleMute = () => {
    const next = !v.muted;
    setVoiceMute(next);
    toast.success(next ? "Microphone muted" : "Microphone unmuted");
  };

  const handleToggleDeafen = () => {
    const next = !v.deafened;
    setVoiceDeafen(next);
    toast.success(next ? "Deafened (output muted)" : "Undeafened");
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
        onClick={() => s.toggleVoice()}
      >
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-full w-full max-w-sm flex-col bg-[var(--anon-panel)] hairline-l shadow-2xl shadow-black/50"
        >
          {/* header */}
          <div className="flex h-11 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              <Radio className="h-4 w-4 anon-accent" /> Voice mesh
            </h2>
            <button
              onClick={() => s.toggleVoice()}
              className="anon-mut hover:anon-fg p-1 cursor-pointer"
              aria-label="Close voice panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* connection status */}
          <div className="hairline-b p-4">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex h-10 w-10 items-center justify-center ${v.connected ? "anim-pulse-ring" : ""}`}
                style={{ background: v.connected ? "var(--anon-ok)" : "var(--anon-line2)" }}
              >
                <Radio className="h-5 w-5 text-black" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="anon-mono text-xs anon-fg font-medium">
                  {v.connected ? "connected · P2P mesh" : "disconnected"}
                </div>
                <div className="anon-mono text-[10px] anon-dim truncate">
                  {v.connected
                    ? `WebRTC · DTLS-SRTP · ${s.participants.filter((p) => p.online).length} peers`
                    : "click join to enable peer voice"}
                </div>
              </div>
              {!v.connected ? (
                <button
                  onClick={handleJoin}
                  className="anon-mono inline-flex h-8 items-center gap-1.5 bg-[var(--anon-ok)] px-3 text-xs text-black hover:brightness-110 cursor-pointer font-medium"
                >
                  <Radio className="h-3.5 w-3.5" /> join
                </button>
              ) : (
                <button
                  onClick={handleDisconnect}
                  className="anon-mono inline-flex h-8 items-center gap-1.5 hairline px-3 text-xs anon-mut hover:text-[var(--anon-danger)] hover:bg-[var(--anon-raise)] cursor-pointer"
                >
                  disconnect
                </button>
              )}
            </div>
          </div>

          {/* real mic level */}
          {v.connected && (
            <div className="hairline-b p-4">
              <div className="anon-mono mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider anon-dim">
                <span>microphone level</span>
                <span>{v.muted ? "MUTED" : `${v.level || 0}%`}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 bg-[var(--anon-line)] overflow-hidden">
                  <div
                    className="h-full transition-all duration-75"
                    style={{
                      width: v.muted ? "0%" : `${Math.min(100, Math.max(0, v.level || 0))}%`,
                      background:
                        (v.level || 0) > 65
                          ? "var(--anon-danger)"
                          : (v.level || 0) > 30
                          ? "var(--anon-warn)"
                          : "var(--anon-ok)",
                    }}
                  />
                </div>
                <span className="anon-mono w-8 text-right text-[10px] anon-mut">
                  {v.muted ? "0" : v.level || 0}
                </span>
              </div>
            </div>
          )}

          {/* controls */}
          {v.connected && (
            <div className="hairline-b p-4 space-y-2">
              {/* push to talk */}
              <button
                onMouseDown={() => setVoicePushToTalk(true)}
                onMouseUp={() => setVoicePushToTalk(false)}
                onMouseLeave={() => setVoicePushToTalk(false)}
                onTouchStart={() => setVoicePushToTalk(true)}
                onTouchEnd={() => setVoicePushToTalk(false)}
                className={`anon-mono flex h-16 w-full items-center justify-center gap-2 text-sm font-medium transition-all select-none cursor-pointer ${
                  v.pushToTalk || v.speaking
                    ? "bg-[var(--anon-ok)] text-black scale-[0.98]"
                    : "hairline anon-fg hover:bg-[var(--anon-raise)]"
                }`}
                style={v.pushToTalk || v.speaking ? { boxShadow: "0 0 0 4px var(--anon-ok)" } : undefined}
              >
                <Mic className={`h-5 w-5 ${v.pushToTalk || v.speaking ? "animate-pulse" : ""}`} />
                {v.pushToTalk ? "speaking…" : "hold to talk"}
              </button>

              {/* mute + deafen */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleToggleMute}
                  className={`anon-mono flex items-center justify-center gap-1.5 py-2 text-xs hairline cursor-pointer ${
                    v.muted
                      ? "bg-[var(--anon-danger)] text-white border-[var(--anon-danger)]"
                      : "anon-fg hover:bg-[var(--anon-raise)]"
                  }`}
                >
                  {v.muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  {v.muted ? "unmute" : "mute"}
                </button>
                <button
                  onClick={handleToggleDeafen}
                  className={`anon-mono flex items-center justify-center gap-1.5 py-2 text-xs hairline cursor-pointer ${
                    v.deafened
                      ? "bg-[var(--anon-warn)] text-black border-[var(--anon-warn)]"
                      : "anon-fg hover:bg-[var(--anon-raise)]"
                  }`}
                >
                  {v.deafened ? <Headphones className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  {v.deafened ? "undeafen" : "deafen"}
                </button>
              </div>
            </div>
          )}

          {/* participants */}
          <div className="flex-1 overflow-y-auto anon-scroll p-3">
            <div className="anon-mono mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider anon-dim">
              <Users className="h-3 w-3" /> in voice · {s.participants.filter((p) => p.online).length}
            </div>
            {s.participants
              .filter((p) => p.online)
              .map((p) => {
                const isMe = p.id === "me";
                const isSpeaking = isMe ? v.speaking : Boolean(p.speaking);
                const isMuted = isMe ? v.muted : Boolean(p.muted);
                const isDeafened = isMe ? v.deafened : Boolean(p.deafened);

                return (
                  <div key={p.id} className="flex items-center gap-2.5 px-2 py-2">
                    <span
                      className={`anon-mono relative inline-flex h-8 w-8 flex-none items-center justify-center text-[11px] font-semibold text-black ${
                        isSpeaking ? "anim-pulse-ring" : ""
                      }`}
                      style={{ background: p.color }}
                    >
                      {initials(p.name)}
                      {isSpeaking && (
                        <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-3 w-3 items-center justify-center bg-[var(--anon-ok)]">
                          <Activity className="h-2 w-2 text-black" />
                        </span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="anon-mono truncate text-[11px] anon-fg">
                        {isMe ? "you" : p.name}
                        {p.isOwner && <span className="ml-1 anon-warn">★</span>}
                      </div>
                      <div className="anon-mono text-[10px] anon-dim">
                        {isSpeaking
                          ? "speaking"
                          : isMuted
                          ? "muted"
                          : isDeafened
                          ? "deafened"
                          : v.connected
                          ? "listening"
                          : "in room"}
                      </div>
                    </div>
                    {/* state indicator */}
                    <div className="flex items-center gap-1.5 flex-none text-[10px] anon-dim">
                      {isMuted ? (
                        <MicOff className="h-3 w-3 text-[var(--anon-danger)]" />
                      ) : isSpeaking ? (
                        <span className="h-2 w-2 rounded-full bg-[var(--anon-ok)] animate-ping" />
                      ) : null}
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="hairline-t px-3 py-1.5 anon-mono text-[10px] anon-dim flex items-center justify-between">
            <span>WebRTC · P2P mesh · zero recording</span>
            <span>{v.muted ? "muted" : v.speaking ? "talking" : "ready"}</span>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
