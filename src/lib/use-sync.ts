"use client";

/**
 * React glue for the real relay sync. The heavy lifting lives in
 * src/lib/relay.ts (binary WebSocket protocol + E2EE) and src/lib/session.ts
 * (Yjs document ↔ store bridge). This hook mirrors displayName / color
 * changes into the awareness presence while a session is live.
 *
 * The session itself is started by the store's submitEntry() (create/join
 * room) — no socket.io is involved anywhere; the client speaks the same
 * binary frame protocol as relay.avishkark.in.
 */

import { useEffect } from "react";
import { useAnon } from "@/lib/store";
import { getSession } from "./session";

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
