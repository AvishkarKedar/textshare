"use client";

import { Wifi, Lock, Zap, CloudOff, Eye, LockIcon, Radio } from "lucide-react";
import { useAnon } from "@/lib/store";

export function StatusBar() {
  const s = useAnon();
  const online = s.participants.filter((p) => p.online).length;
  return (
    <footer className="flex h-7 items-center gap-3 hairline-t anon-raise px-3 anon-mono text-[10px] anon-mut">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full anim-beat" style={{ background: "var(--anon-ok)" }} />
        <Wifi className="h-3 w-3" /> connected
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Radio className="h-3 w-3" /> {online} online
      </span>
      <span className="inline-flex items-center gap-1" style={{ color: "var(--anon-ok)" }}>
        <Lock className="h-3 w-3" /> e2e
      </span>
      <span className="inline-flex items-center gap-1" style={{ color: "var(--anon-accent)" }}>
        <Zap className="h-3 w-3" /> turbo
      </span>
      {s.zenMode && (
        <span className="inline-flex items-center gap-1" style={{ color: "var(--anon-warn)" }}>
          <Eye className="h-3 w-3" /> zen
        </span>
      )}
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden sm:inline">{s.roomCode || "ABC123"} · {s.ttl}</span>
        <span className="hidden md:inline">utf-8</span>
        <span className="hidden md:inline">{s.keybindings}</span>
        <span>ln 1, col 1</span>
      </div>
    </footer>
  );
}
