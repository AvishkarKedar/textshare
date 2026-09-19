"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Activity,
  Server,
  Shield,
  Zap,
  Globe,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useAnon } from "@/lib/store";

interface StatusData {
  ok: boolean;
  service: string;
  version: string;
  uptimeHuman: string;
  relay: { url: string; status: string };
  crypto: { algorithm: string; iterations: number; cipher: string };
  rooms: { maxConnections: number; ttlOptions: string[]; note: string };
  runner: { languages: number; sandbox: string; maxRamMb: number };
  limits: { ipPerMin: number; createPerMin: number; authAttemptsPerMin: number };
}

export function StatusModal() {
  const s = useAnon();
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!s.statusOpen) return;
    let active = true;
    // fetch on open; setLoading is derived from data/error state
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => { if (active) { setData(d); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [s.statusOpen]);

  if (!s.statusOpen) return null;
  const loading = !data && !error;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={() => s.toggleStatus()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[85vh] w-full max-w-2xl flex-col hairline anon-panel shadow-2xl shadow-black/60"
        >
          {/* header */}
          <div className="flex h-11 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 anon-accent" /> System status
            </h2>
            <div className="anon-mono inline-flex items-center gap-1.5 text-[10px]">
              <span className="h-1.5 w-1.5 rounded-full anim-beat" style={{ background: "var(--anon-ok)" }} />
              <span style={{ color: "var(--anon-ok)" }}>operational</span>
            </div>
            <button onClick={() => s.toggleStatus()} className="anon-mut hover:anon-fg">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* body */}
          <div className="anon-scroll flex-1 overflow-y-auto p-5 space-y-4">
            {loading && (
              <div className="flex items-center justify-center py-12 gap-2 anon-mut">
                <Loader2 className="h-5 w-5 animate-spin anon-accent" />
                <span className="anon-mono text-xs">fetching metrics…</span>
              </div>
            )}

            {data && !loading && (
              <>
                {/* service header */}
                <div className="hairline bg-[var(--anon-bg)] p-4 flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center bg-[var(--anon-ok)]">
                    <CheckCircle2 className="h-5 w-5 text-black" />
                  </span>
                  <div className="flex-1">
                    <div className="anon-sans text-base font-semibold anon-fg">{data.service}</div>
                    <div className="anon-mono text-[11px] anon-dim">v{data.version} · up {data.uptimeHuman}</div>
                  </div>
                </div>

                {/* grid of real config cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <MetricCard icon={Server} label="relay" value={data.relay.url} sub={data.relay.status} color="var(--anon-accent)" />
                  <MetricCard icon={Shield} label="cipher" value={data.crypto.cipher} sub={`${(data.crypto.iterations / 1000).toFixed(0)}k PBKDF2 rounds`} color="var(--anon-ok)" />
                  <MetricCard icon={Activity} label="max peers" value={`${data.rooms.maxConnections}`} sub={`TTL: ${data.rooms.ttlOptions.join(" / ")}`} color="var(--anon-accent)" />
                  <MetricCard icon={Zap} label="runner" value={`${data.runner.languages} langs`} sub={`${data.runner.maxRamMb}MB cap`} color="var(--anon-warn)" />
                  <MetricCard icon={Globe} label="sync" value="socket.io" sub="port 3003 · websocket" color="var(--anon-accent)" />
                  <MetricCard icon={Shield} label="auth storage" value="SHA-256" sub="relay never sees raw auth" color="var(--anon-ok)" />
                </div>

                {/* limits */}
                <div className="hairline bg-[var(--anon-bg)] p-4">
                  <div className="anon-mono mb-2 text-[10px] uppercase tracking-wider anon-dim">rate limits (per IP)</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="anon-mono text-lg anon-fg">{data.limits.ipPerMin}</div>
                      <div className="anon-mono text-[10px] anon-dim">requests/min</div>
                    </div>
                    <div>
                      <div className="anon-mono text-lg anon-fg">{data.limits.createPerMin}</div>
                      <div className="anon-mono text-[10px] anon-dim">creates/min</div>
                    </div>
                    <div>
                      <div className="anon-mono text-lg" style={{ color: "var(--anon-danger)" }}>{data.limits.authAttemptsPerMin}</div>
                      <div className="anon-mono text-[10px] anon-dim">auth/min</div>
                    </div>
                  </div>
                </div>

                {/* sandbox note */}
                <div className="hairline bg-[var(--anon-bg)] p-3 flex items-start gap-2">
                  <Shield className="h-3.5 w-3.5 flex-none mt-0.5" style={{ color: "var(--anon-ok)" }} />
                  <p className="anon-mono text-[10px] leading-relaxed anon-mut">
                    runner sandbox: <span className="anon-fg">{data.runner.sandbox}</span>. self-hosted relay runs a
                    real bubblewrap namespace; the public worker falls back to emkc.org Piston.
                  </p>
                </div>
              </>
            )}

            {!data && !loading && (
              <div className="anon-mono py-12 text-center text-xs anon-mut">
                failed to fetch status — relay may be unreachable
              </div>
            )}
          </div>

          <div className="hairline-t px-3 py-1.5 anon-mono text-[10px] anon-dim flex items-center justify-between">
            <span>GET /api/status</span>
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="hairline bg-[var(--anon-bg)] p-3">
      <div className="anon-mono mb-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider anon-dim">
        <Icon className="h-2.5 w-2.5" style={{ color }} /> {label}
      </div>
      <div className="anon-mono truncate text-sm anon-fg" title={value}>{value}</div>
      <div className="anon-mono text-[10px] anon-dim">{sub}</div>
    </div>
  );
}
