"use client";

import { Wifi, Lock, Zap, Eye, Radio, HelpCircle, ShieldCheck } from "lucide-react";
import { useAnon } from "@/lib/store";

export function StatusBar() {
  const s = useAnon();
  const online = s.participants.filter((p) => p.online).length;
  return (
    <footer className="flex h-7 items-center gap-3 hairline-t anon-raise px-3 anon-mono text-[10px] anon-mut select-none">
      <button
        onClick={() => s.toggleStatus()}
        className="inline-flex items-center gap-1.5 hover:text-[var(--anon-fg)] cursor-pointer transition-colors"
        title="View live system status & metrics"
      >
        <span className="h-1.5 w-1.5 rounded-full anim-beat" style={{ background: "var(--anon-ok)" }} />
        <Wifi className="h-3 w-3" /> connected
      </button>

      <span className="inline-flex items-center gap-1.5">
        <Radio className="h-3 w-3" /> {online} online
      </span>

      <button
        onClick={() => s.toggleSecurity()}
        className="inline-flex items-center gap-1 hover:brightness-125 cursor-pointer transition-colors"
        style={{ color: "var(--anon-ok)" }}
        title="Zero-knowledge E2E encryption active"
      >
        <Lock className="h-3 w-3" /> e2e
      </button>

      <button
        onClick={() => s.toggleFaq()}
        className="inline-flex items-center gap-1 hover:text-[var(--anon-accent)] cursor-pointer transition-colors"
        title="Open FAQs & Help (⌘⇧F)"
      >
        <HelpCircle className="h-3 w-3" /> FAQ
      </button>

      {s.zenMode && (
        <button
          onClick={() => s.toggleZen()}
          className="inline-flex items-center gap-1 cursor-pointer"
          style={{ color: "var(--anon-warn)" }}
          title="Exit zen mode (⌘.)"
        >
          <Eye className="h-3 w-3" /> zen
        </button>
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
