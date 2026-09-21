"use client";

/**
 * React glue for the real relay sync. The heavy lifting lives in
 * src/lib/relay.ts (binary WebSocket protocol + E2EE) and src/lib/session.ts
 * (Yjs document ↔ store bridge + voice mesh). This hook:
 *
 *   1. mirrors displayName / color changes into the awareness presence
 *   2. keeps a module-level handle to the active session for voice helpers
 *
 * The session itself is started by the store's submitEntry() (create/join
 * room) — no socket.io is involved anywhere; the client speaks the same
 * binary frame protocol as relay.avishkark.in.
 */

import { useEffect } from "react";
import { useAnon } from "@/lib/store";
import {
  getSession,
  joinVoice as sessionJoinVoice,
  leaveVoice as sessionLeaveVoice,
  setLocalVoice,
  getVoiceMesh,
} from "./session";
import { VoiceMesh } from "./voice";

export function getActiveVoiceMesh(): VoiceMesh | null {
  return getVoiceMesh();
}

export async function joinVoiceMesh(): Promise<boolean> {
  const mesh = sessionJoinVoice();
  if (!mesh) return false;
  await mesh.start();
  useAnon.getState().setVoiceConnected(true);
  return true;
}

export function leaveVoiceMesh() {
  sessionLeaveVoice();
  useAnon.getState().setVoiceConnected(false);
  useAnon.getState().setSpeaking(false);
  useAnon.getState().setMicLevel(0);
}

export function setVoiceMute(muted: boolean) {
  getVoiceMesh()?.setMuted(muted);
  useAnon.getState().setMuted(muted);
  setLocalVoice({ muted });
}

export function setVoiceDeafen(deafened: boolean) {
  getVoiceMesh()?.setDeafened(deafened);
  useAnon.getState().setDeafened(deafened);
  setLocalVoice({ deafened });
}

export function setVoicePushToTalk(speaking: boolean) {
  getVoiceMesh()?.setMuted(!speaking);
  useAnon.getState().setPushToTalk(speaking);
}

/**
 * Keeps presence metadata (name / color) in sync while a session is live.
 */
export function useSync() {
  const view = useAnon((s) => s.view);
  const roomCode = useAnon((s) => s.roomCode);
  const displayName = useAnon((s) => s.displayName);
  const color = useAnon((s) => s.color);

  useEffect(() => {
    if (view !== "editor" || !roomCode) return;
    const session = getSession();
    if (!session) return;
    const relay = session.relay;
    const user = (relay.awareness.getLocalState()?.user || {}) as Record<string, unknown>;
    relay.awareness.setLocalStateField("user", { ...user, name: displayName || "you", color });
    relay.awareness.setLocalStateField("act", Date.now());
  }, [view, roomCode, displayName, color]);
}
