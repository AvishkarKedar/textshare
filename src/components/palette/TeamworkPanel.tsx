"use client";

/**
 * /teamwork — the room's live teamwork surface.
 *
 * Everything here is real store state mirrored from the encrypted Yjs
 * session: participants come from awareness, counts from the live arrays.
 * No simulated presence, no fake stats.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Users,
  Copy,
  Link2,
  MessageSquare,
  Play,
  Target,
  Lock,
  Crown,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { useAnon } from "@/lib/store";
import { COMPILER_ENABLED } from "@/lib/flags";

export function TeamworkPanel() {
  const s = useAnon();
  // inline "set goal" form (replaces the old blocking window.prompt) —
  // null = form closed, otherwise the current draft
  const [goalDraft, setGoalDraft] = useState<string | null>(null);

  // Esc closes the panel, matching every other overlay in the app
  useEffect(() => {
    if (!s.teamworkOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        useAnon.getState().toggleTeamwork();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s.teamworkOpen]);

  if (!s.teamworkOpen || !s.roomCode) return null;

  const peers = s.participants;
  const onlineCount = peers.filter((p) => p.online !== false).length;
  const goalEditing = goalDraft !== null;

  function copyCode() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      // clipboard rejects when the document is not focused — a silent no-op
      // beats an unhandled rejection in the console.
      navigator.clipboard.writeText(s.roomCode).catch(() => {});
      toast.success("Room code copied", {
        description: `${s.roomCode} — send it to a teammate.`,
      });
    }
  }

  function pinGoal() {
    const text = (goalDraft ?? "").trim();
    if (!text) return;
    setGoalDraft(null);
    s.setGoal(text);
    toast.success("Goal pinned", { description: text });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-start justify-end bg-black/40"
        onClick={() => s.toggleTeamwork()}
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
              <Users className="h-4 w-4 anon-accent" /> Teamwork
              <span className="anon-mono ml-1 text-[10px] anon-mut">
                {onlineCount} online
              </span>
            </h2>
            <button onClick={() => s.toggleTeamwork()} className="anon-mut hover:anon-fg" aria-label="Close teamwork panel">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* room identity */}
            <div className="hairline-b px-4 py-3">
              <div className="anon-mono text-[10px] uppercase tracking-wider anon-dim">room</div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="anon-mono anon-accent text-lg tracking-[0.25em]">{s.roomCode}</span>
                <button
                  onClick={copyCode}
                  className="anon-mono hairline anon-raise px-1.5 py-0.5 text-[10px] anon-mut hover:anon-fg"
                  aria-label="Copy room code"
                >
                  <Copy className="h-3 w-3" /> copy
                </button>
              </div>
              <div className="anon-mono mt-1 text-xs anon-fg truncate" title={s.roomTitle}>
                {s.roomTitle || "session"}
              </div>
              <div className="anon-mono mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] anon-mut">
                {s.isOwner && <span className="inline-flex items-center gap-1"><Crown className="h-3 w-3" /> you created this</span>}
                {s.hasPassword && <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> password-protected</span>}
                <span>erases {s.ttl} after everyone leaves</span>
              </div>
            </div>

            {/* live peers */}
            <div className="hairline-b px-4 py-3">
              <div className="anon-mono text-[10px] uppercase tracking-wider anon-dim">who&apos;s here</div>
              <ul className="mt-2 flex flex-col gap-2">
                {peers.map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5">
                    <span
                      className="inline-block h-2.5 w-2.5 flex-none rounded-full"
                      style={{ background: p.color }}
                      aria-hidden
                    />
                    <span className="anon-mono truncate text-xs anon-fg">
                      {p.name}
                      {p.id === "me" && <span className="anon-dim"> (you)</span>}
                    </span>
                    {p.isOwner && <Crown className="h-3 w-3 flex-none anon-warn" aria-label="room owner" />}
                    {p.typing && (
                      <span className="anon-mono ml-auto flex-none text-[9.5px] anon-accent">
                        typing{p.typingIn === "chat" ? " in chat" : ""}…
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {peers.length === 1 && (
                <p className="anon-mono mt-2 text-[9.5px] anon-dim">
                  share the code — peers appear here the moment they join, with live cursors and typing.
                </p>
              )}
            </div>

            {/* live session facts */}
            <div className="hairline-b px-4 py-3">
              <div className="anon-mono text-[10px] uppercase tracking-wider anon-dim">live session</div>
              <div className="anon-mono mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                <span className="anon-mut">files</span>
                <span className="anon-fg">{s.files.length}</span>
                <span className="anon-mut">chat messages</span>
                <span className="anon-fg">{s.messages.length}</span>
                <span className="anon-mut">shared files</span>
                <span className="anon-fg">{s.sharedFiles.length}</span>
                <span className="anon-mut">connection</span>
                <span className="inline-flex items-center gap-1.5 anon-fg">
                  {s.syncState === "connected" || s.syncState === "synced" ? (
                    <>
                      <Wifi className="h-3 w-3 anon-ok" /> {s.syncState}
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3 anon-warn" /> {s.syncState}
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* quick actions */}
            <div className="px-4 py-3">
              <div className="anon-mono text-[10px] uppercase tracking-wider anon-dim">actions</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => { s.toggleInvite(); s.toggleTeamwork(); }}
                  className="anon-mono hairline anon-raise px-2 py-2 text-[11px] anon-mut hover:anon-fg inline-flex items-center justify-center gap-1.5"
                >
                  <Link2 className="h-3.5 w-3.5" /> invite
                </button>
                <button
                  onClick={() => { s.toggleChat(); s.toggleTeamwork(); }}
                  className="anon-mono hairline anon-raise px-2 py-2 text-[11px] anon-mut hover:anon-fg inline-flex items-center justify-center gap-1.5"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> chat
                </button>
                {COMPILER_ENABLED && (
                  <button
                    onClick={() => { s.runCode(); s.toggleTeamwork(); }}
                    className="anon-mono hairline anon-raise px-2 py-2 text-[11px] anon-mut hover:anon-fg inline-flex items-center justify-center gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5" /> run
                  </button>
                )}
                <button
                  onClick={() => setGoalDraft(goalEditing ? null : s.goalText)}
                  className="anon-mono hairline anon-raise px-2 py-2 text-[11px] anon-mut hover:anon-fg inline-flex items-center justify-center gap-1.5"
                >
                  <Target className="h-3.5 w-3.5" /> set goal
                </button>
              </div>

              {/* inline goal form — Enter pins, Esc cancels (never a
                  blocking window.prompt) */}
              {goalEditing && (
                <form
                  onSubmit={(e) => { e.preventDefault(); pinGoal(); }}
                  className="mt-2 hairline bg-[var(--anon-raise)] p-2"
                >
                  <label
                    htmlFor="teamwork-goal-input"
                    className="anon-mono block text-[10px] uppercase tracking-wider anon-dim"
                  >
                    session goal
                  </label>
                  <input
                    id="teamwork-goal-input"
                    type="text"
                    autoFocus
                    value={goalDraft ?? ""}
                    maxLength={200}
                    onChange={(e) => setGoalDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        setGoalDraft(null);
                      }
                    }}
                    placeholder="ship the deriveKey split by EOD"
                    className="anon-mono mt-1.5 h-9 w-full bg-[var(--anon-bg)] hairline px-3 text-xs anon-fg outline-none focus:border-[var(--anon-accent)]"
                  />
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      type="submit"
                      disabled={!(goalDraft ?? "").trim()}
                      className="anon-mono inline-flex h-8 flex-1 items-center justify-center bg-[var(--anon-accent)] px-2 text-[11px] text-[var(--anon-accent-fg)] transition-transform hover:brightness-110 active:translate-y-px disabled:opacity-50"
                    >
                      pin goal
                    </button>
                    <button
                      type="button"
                      onClick={() => setGoalDraft(null)}
                      className="anon-mono hairline anon-raise h-8 px-2.5 text-[11px] anon-mut hover:anon-fg"
                    >
                      cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
