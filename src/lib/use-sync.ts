"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAnon } from "@/lib/store";
import type { Participant } from "@/lib/store";

/**
 * Connects to the anonshare-sync mini-service (port 3003) via the gateway.
 * Syncs: presence (peers), cursor positions, edits, chat messages.
 *
 * The URL uses the relative path "/" with XTransformPort=3003 so Caddy
 * forwards to the mini-service correctly.
 */
export function useSync() {
  const socketRef = useRef<Socket | null>(null);
  const view = useAnon((s) => s.view);
  const roomCode = useAnon((s) => s.roomCode);
  const displayName = useAnon((s) => s.displayName);
  const color = useAnon((s) => s.color);
  const isOwner = useAnon((s) => s.isOwner);

  useEffect(() => {
    if (view !== "editor" || !roomCode) return;

    const socket = io("/?XTransformPort=3003", {
      path: "/",
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[sync] connected", socket.id);
      // expose socket globally so other components (chat, editor) can emit
      (window as unknown as { __anonSocket?: Socket }).__anonSocket = socket;
      socket.emit("join", {
        room: roomCode,
        name: displayName || "you",
        color,
        isOwner,
        cursorLine: 1,
      });
    });

    socket.on("peers", (peers: PeerWire[]) => {
      // merge: always keep "me" as the first entry, replace the rest with wire peers
      const me = useAnon.getState().participants.find((p) => p.id === "me");
      const others: Participant[] = peers
        .filter((p) => p.id !== socket.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          cursorLine: p.cursorLine,
          isOwner: p.isOwner,
          online: true,
        }));
      useAnon.setState({
        participants: [me ?? { id: "me", name: displayName, color, isOwner, online: true, cursorLine: 1 }, ...others],
      });
    });

    socket.on("cursor", (data: { id: string; line: number }) => {
      useAnon.setState((s) => ({
        participants: s.participants.map((p) =>
          p.id === data.id ? { ...p, cursorLine: data.line, online: true } : p,
        ),
      }));
    });

    socket.on("edit", (data: { id: string; fileId: string; content: string }) => {
      // apply remote edit if it's for the active file
      useAnon.setState((s) => ({
        files: s.files.map((f) => (f.id === data.fileId ? { ...f, content: data.content } : f)),
      }));
    });

    socket.on("chat", (msg: ChatMessageWire) => {
      // skip if it's our own message (we already added it locally)
      if (msg.authorId === socket.id) return;
      useAnon.getState().addMessage({
        authorId: msg.authorId,
        authorName: msg.authorName,
        color: msg.color,
        body: msg.body,
        codeBlock: msg.codeBlock ?? null,
        pinned: false,
        threadParent: null,
      });
    });

    socket.on("disconnect", () => {
      console.log("[sync] disconnected, will retry");
    });

    socket.on("connect_error", (err: Error) => {
      console.warn("[sync] connect error:", err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      delete (window as unknown as { __anonSocket?: Socket }).__anonSocket;
    };
  }, [view, roomCode, displayName, color, isOwner]);

  return socketRef;
}

interface PeerWire {
  id: string;
  name: string;
  color: string;
  room: string;
  cursorLine?: number;
  isOwner?: boolean;
}

interface ChatMessageWire {
  id: string;
  authorId: string;
  authorName: string;
  color: string;
  body: string;
  codeBlock?: { lang: string; src: string } | null;
  ts: number;
  kind: "user" | "system";
}
