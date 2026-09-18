"use client";

import { Shield, Timer, UserX, Wifi } from "lucide-react";

const PRINCIPLES = [
  { icon: Shield, label: "end-to-end encrypted", sub: "AES-GCM 256 · PBKDF2 600k", color: "var(--anon-ok)" },
  { icon: Timer, label: "auto-erased", sub: "10m / 1h / 24h TTL", color: "var(--anon-warn)" },
  { icon: UserX, label: "no account", sub: "no email · no cookies", color: "var(--anon-accent)" },
  { icon: Wifi, label: "real-time", sub: "websocket + WebRTC mesh", color: "var(--anon-danger)" },
];

export function StatsStrip() {
  return (
    <section className="hairline-t hairline-b anon-raise">
      <div className="mx-auto max-w-7xl px-6 py-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {PRINCIPLES.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.label} className="flex items-center gap-3">
                <span
                  className="inline-flex h-9 w-9 flex-none items-center justify-center hairline"
                  style={{ color: p.color }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="anon-sans text-sm font-medium anon-fg">{p.label}</div>
                  <div className="anon-mono truncate text-[10px] anon-mut">{p.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
