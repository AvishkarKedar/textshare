"use client";

import { Wifi, WifiOff, Lock, Eye, Radio, HelpCircle, ShieldCheck, Timer } from "lucide-react";
import { useAnon } from "@/lib/store";
import type { ConnState } from "@/lib/relay";

function connInfo(state: ConnState): { label: string; color: string; title: string } {
  switch (state) {
    case "synced":
      return { label: "synced", color: "var(--anon-ok)", title: "Connected to the relay — full history synced" };
    case "connected":
      return { label: "connected", color: "var(--anon-ok)", title: "Connected to the relay — syncing" };
    case "connecting":
      return { label: "connecting…", color: "var(--anon-warn)", title: "Establishing the encrypted relay connection" };
    case "retrying":
      return { label: "reconnecting…", color: "var(--anon-warn)", title: "Relay unreachable — retrying with backoff" };
    default:
      return { label: "offline", color: "var(--anon-danger)", title: "Not connected — local-only until the relay answers" };
  }
}

function fmtTtl(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function StatusBar() {
  const s = useAnon();
  const online = s.participants.filter((p) => p.online).length;
  const conn = connInfo(s.syncState);
  const e2e = s.syncState === "connected" || s.syncState === "synced";

  // Room TTL reported live by the relay in the room-state frame.
  const ttlMs = s.roomState?.ttl ?? null;
  const ttlLabel = ttlMs != null ? fmtTtl(ttlMs) : s.ttl;

  return (
    <footer className="flex h-7 items-center gap-3 hairline-t anon-raise px-3 anon-mono text-[10px] anon-mut select-none">
      <button
        onClick={() => s.toggleStatus()}
        className="inline-flex items-center gap-1.5 hover:text-[var(--anon-fg)] cursor-pointer transition-colors"
        title={conn.title}
      >
        <span className="h-1.5 w-1.5 rounded-full anim-beat" style={{ background: conn.color }} />
        {s.syncState === "retrying" || s.syncState === "dead" ? (
          <WifiOff className="h-3 w-3" />
        ) : (
          <Wifi className="h-3 w-3" />
        )}{" "}
        {conn.label}
      </button>

      <span className="inline-flex items-center gap-1.5">
        <Radio className="h-3 w-3" /> {online} online
        {s.roomState && s.roomState.peers > 0 && (
          <span className="anon-dim">({s.roomState.peers} relay)</span>
        )}
      </span>

      <button
        onClick={() => s.toggleSecurity()}
        className="inline-flex items-center gap-1 hover:brightness-125 cursor-pointer transition-colors"
        style={{ color: e2e ? "var(--anon-ok)" : "var(--anon-mut)" }}
        title={e2e ? "Zero-knowledge E2E encryption active (AES-GCM-256)" : "Encryption active once the relay link is up"}
      >
        <Lock className="h-3 w-3" /> e2e
      </button>

      {s.roomState?.locked && (
        <span className="inline-flex items-center gap-1 cursor-pointer" style={{ color: "var(--anon-warn)" }} title="Room locked by the owner — read-only">
          <ShieldCheck className="h-3 w-3" /> read-only
        </span>
      )}

      {!s.canEdit && !s.roomState?.locked && (
        <span className="inline-flex items-center gap-1" style={{ color: "var(--anon-warn)" }} title="The owner has not granted you edit rights">
          <Eye className="h-3 w-3" /> viewer
        </span>
      )}

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
        <span className="hidden sm:inline items-center gap-1">
          {s.roomCode || "------"}
          <span className="anon-dim"> · <Timer className="inline h-3 w-3 align-[-2px]" /> {ttlLabel} left</span>
        </span>
        <span className="hidden md:inline">utf-8</span>
        <span className="hidden md:inline">{s.keybindings}</span>
        <span>ln 1, col 1</span>
      </div>
    </footer>
  );
}
