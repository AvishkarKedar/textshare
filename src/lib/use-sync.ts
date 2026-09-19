"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAnon } from "@/lib/store";
import type { Participant } from "@/lib/store";
import { VoiceMesh, VoiceSignal } from "@/lib/voice";

let activeVoiceMesh: VoiceMesh | null = null;

export function getActiveVoiceMesh(): VoiceMesh | null {
  return activeVoiceMesh;
}

export async function joinVoiceMesh(): Promise<boolean> {
  const socket = (typeof window !== "undefined" && (window as unknown as { __anonSocket?: Socket }).__anonSocket) || null;
  if (!socket || !socket.connected) {
    // If not connected to signaling socket, create standalone mesh
    if (!activeVoiceMesh) {
      activeVoiceMesh = new VoiceMesh("me", () => {});
    }
  }
  if (!activeVoiceMesh && socket) {
    activeVoiceMesh = new VoiceMesh(socket.id || "me", (target, signal) => {
      socket.emit("voice-signal", { target, signal });
    });
  }

  if (activeVoiceMesh) {
    activeVoiceMesh.onSpeaking = (cid, speaking) => {
      if (cid === (socket?.id || "me") || cid === "me") {
        useAnon.getState().setSpeaking(speaking);
        socket?.emit("voice-state", {
          speaking,
          muted: useAnon.getState().voice.muted,
          deafened: useAnon.getState().voice.deafened,
        });
      } else {
        useAnon.setState((s) => ({
          participants: s.participants.map((p) => (p.id === cid ? { ...p, speaking } : p)),
        }));
      }
    };

    activeVoiceMesh.onLevel = (level) => {
      useAnon.getState().setMicLevel(level);
    };

    try {
      await activeVoiceMesh.start();
      useAnon.getState().setVoiceConnected(true);
      return true;
    } catch (err) {
      console.warn("[voice] Error accessing microphone:", err);
      useAnon.getState().setVoiceConnected(false);
      throw err;
    }
  }
  return false;
}

export function leaveVoiceMesh() {
  if (activeVoiceMesh) {
    activeVoiceMesh.stop();
  }
  useAnon.getState().setVoiceConnected(false);
  useAnon.getState().setSpeaking(false);
  useAnon.getState().setMicLevel(0);
}

export function setVoiceMute(muted: boolean) {
  if (activeVoiceMesh) {
    activeVoiceMesh.setMuted(muted);
  }
  useAnon.getState().setMuted(muted);
}

export function setVoiceDeafen(deafened: boolean) {
  if (activeVoiceMesh) {
    activeVoiceMesh.setDeafened(deafened);
  }
  useAnon.getState().setDeafened(deafened);
}

export function setVoicePushToTalk(speaking: boolean) {
  if (activeVoiceMesh) {
    activeVoiceMesh.setMuted(!speaking);
  }
  useAnon.getState().setPushToTalk(speaking);
}

/**
 * Connects to the real-time sync relay and manages presence, chat, edits, and WebRTC voice mesh.
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

    // Resolve relay URL: In production use relay.avishkark.in with fallback
    let relayUrl = "https://relay.avishkark.in";
    if (typeof window !== "undefined") {
      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        relayUrl = "http://localhost:3003";
      } else if (process.env.NEXT_PUBLIC_RELAY_URL) {
        relayUrl = process.env.NEXT_PUBLIC_RELAY_URL;
      }
    }

    const socket = io(relayUrl, {
      path: "/",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[sync] connected", socket.id);
      (window as unknown as { __anonSocket?: Socket }).__anonSocket = socket;

      // Initialize voice mesh with socket signaling
      activeVoiceMesh = new VoiceMesh(socket.id || "me", (target, signal) => {
        socket.emit("voice-signal", { target, signal });
      });

      activeVoiceMesh.onSpeaking = (cid, speaking) => {
        if (cid === socket.id || cid === "me") {
          useAnon.getState().setSpeaking(speaking);
          socket.emit("voice-state", {
            speaking,
            muted: useAnon.getState().voice.muted,
            deafened: useAnon.getState().voice.deafened,
          });
        } else {
          useAnon.setState((s) => ({
            participants: s.participants.map((p) => (p.id === cid ? { ...p, speaking } : p)),
          }));
        }
      };

      activeVoiceMesh.onLevel = (level) => {
        useAnon.getState().setMicLevel(level);
      };

      socket.emit("join", {
        room: roomCode,
        name: displayName || "you",
        color,
        isOwner,
        cursorLine: 1,
      });
    });

    socket.on("peers", (peers: PeerWire[]) => {
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
          speaking: false,
        }));
      useAnon.setState({
        participants: [me ?? { id: "me", name: displayName, color, isOwner, online: true, cursorLine: 1, speaking: false }, ...others],
      });

      // If active voice is running, connect peer mesh
      if (activeVoiceMesh && activeVoiceMesh.isActive) {
        others.forEach((p) => {
          activeVoiceMesh?.callPeer(p.id);
        });
      }
    });

    socket.on("voice-signal", ({ sender, signal }: { sender: string; signal: VoiceSignal }) => {
      if (activeVoiceMesh) {
        activeVoiceMesh.handleSignal(sender, signal);
      }
    });

    socket.on("voice-state", (data: { id: string; speaking: boolean; muted?: boolean; deafened?: boolean }) => {
      useAnon.setState((s) => ({
        participants: s.participants.map((p) =>
          p.id === data.id ? { ...p, speaking: data.speaking, muted: data.muted, deafened: data.deafened } : p
        ),
      }));
    });

    socket.on("cursor", (data: { id: string; line: number }) => {
      useAnon.setState((s) => ({
        participants: s.participants.map((p) =>
          p.id === data.id ? { ...p, cursorLine: data.line, online: true } : p,
        ),
      }));
    });

    socket.on("edit", (data: { id: string; fileId: string; content: string }) => {
      useAnon.setState((s) => ({
        files: s.files.map((f) => (f.id === data.fileId ? { ...f, content: data.content } : f)),
      }));
    });

    socket.on("chat", (msg: ChatMessageWire) => {
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
      if (activeVoiceMesh) {
        activeVoiceMesh.destroy();
        activeVoiceMesh = null;
      }
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
