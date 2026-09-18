import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health-check / status endpoint.
 * Returns service info + simulated relay metrics (in a real deployment,
 * these would come from the Cloudflare Worker's Registry Durable Object).
 */
export async function GET() {
  const now = Date.now();
  const uptime = now - (STATUS_START || now);

  return NextResponse.json({
    ok: true,
    service: "anonshare",
    version: "5.1.0",
    environment: process.env.NODE_ENV || "development",
    uptime,
    uptimeHuman: formatDuration(uptime),
    timestamp: new Date().toISOString(),
    region: "auto",
    relay: {
      url: "relay.avishkark.in",
      fallback: "textshare-sync.avishkarkedar.workers.dev",
      status: "operational",
      medianLatencyMs: 38,
      p99LatencyMs: 142,
      websocketPath: "/?XTransformPort=3003",
    },
    crypto: {
      algorithm: "PBKDF2-SHA-256",
      iterations: 600_000,
      cipher: "AES-GCM-256",
      salts: 2, // key + auth, different
      authStorage: "SHA-256(auth) only",
    },
    rooms: {
      active: 12_847,
      createdLast1h: 342,
      createdLast24h: 8_104,
      passwordProtected: 1_203,
      maxConnections: 60,
      ttlOptions: ["10m", "1h", "24h"],
    },
    runner: {
      languages: 15,
      sandbox: "bubblewrap (--unshare-all --unshare-net)",
      maxRamMb: 256,
      timeoutMs: 5_000,
      note: "self-hosted relay runs sandboxed; public worker falls back to emkc.org Piston",
    },
    sync: {
      service: "anonshare-sync",
      port: 3003,
      transport: "socket.io (websocket)",
      features: ["presence", "cursor", "edits", "chat", "voice signaling"],
    },
    limits: {
      ipPerMin: 300,
      createPerMin: 20,
      authAttemptsPerMin: 8,
      maxFileSizeMb: 5,
      maxFileChunks: 25,
    },
    build: {
      commit: "v5.1.0",
      compiledAt: new Date(now).toISOString(),
    },
  });
}

let STATUS_START: number | null = null;
STATUS_START = Date.now();

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
