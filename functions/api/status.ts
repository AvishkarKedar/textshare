// Cloudflare Pages Function: /api/status
// Pings the real relay (relay.avishkark.in) and reports LIVE metrics.
// Falls back to the Cloudflare Worker relay if the VPS is unreachable.
// No hardcoded uptime, no fake "operational" — the relay is actually probed.

interface RelayHealth {
  ok?: boolean;
  service?: string;
  version?: number;
  runtime?: string;
  sandbox?: string;
}

interface RelayStats {
  ok?: boolean;
  uptime?: number;
  activeRooms?: number;
  connectedPeers?: number;
  storedFileChunks?: number;
  sandbox?: string;
  concurrency?: { activeRuns?: number; queuedRuns?: number; maxConcurrent?: number };
  memory?: { rssMb?: number; heapUsedMb?: number };
}

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

async function probe(host: string): Promise<{ health: RelayHealth | null; stats: RelayStats | null; latencyMs: number }> {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const [healthRes, statsRes] = await Promise.all([
      fetch(`https://${host}/health`, { cache: "no-store", signal: ctrl.signal }),
      fetch(`https://${host}/health/stats`, { cache: "no-store", signal: ctrl.signal }),
    ]);
    const health = await healthRes.json().catch(() => null);
    const stats = await statsRes.json().catch(() => null);
    return { health, stats, latencyMs: Date.now() - start };
  } catch {
    return { health: null, stats: null, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestGet(): Promise<Response> {
  const primary = "relay.avishkark.in";
  const fallback = "textshare-sync.avishkarkedar.workers.dev";

  // NOTE: the local result variable must NOT be named `probe` — a same-named
  // let binding shadows the probe() function and throws a TDZ ReferenceError
  // at runtime (compiles fine, crashes on Cloudflare with error 1101).
  let relayHost = primary;
  let probeRes = await probe(relayHost);
  if (!probeRes.health) {
    relayHost = fallback;
    probeRes = await probe(relayHost);
  }

  const online = !!probeRes.health?.ok;
  const stats = probeRes.stats;
  const sandbox = probeRes.health?.sandbox || stats?.sandbox || "unknown";
  const isVps = relayHost === primary;

  return Response.json(
    {
      ok: true,
      service: "anonshare",
      version: "5.3.0",
      environment: "production",
      timestamp: new Date().toISOString(),
      relay: {
        host: relayHost,
        fallback,
        status: online ? "operational" : "unreachable",
        probed: true,
        latencyMs: probeRes.latencyMs,
        runtime: probeRes.health?.runtime || "unknown",
        websocketPath: "/room/<CODE>",
        uptime: stats?.uptime ?? 0,
        uptimeHuman: stats?.uptime ? formatDuration(stats.uptime * 1000) : "unknown",
        activeRooms: stats?.activeRooms ?? 0,
        connectedPeers: stats?.connectedPeers ?? 0,
        storedFileChunks: stats?.storedFileChunks ?? 0,
        sandbox,
        memory: stats?.memory ?? null,
        runnerConcurrency: stats?.concurrency ?? null,
      },
      crypto: {
        algorithm: "PBKDF2-SHA-256",
        iterations: 600_000,
        cipher: "AES-GCM-256",
        salts: 2,
        authStorage: "SHA-256(auth) only",
      },
      rooms: {
        maxConnections: isVps ? 120 : 60,
        ttlOptions: ["10m", "1h", "24h"],
        activeNow: stats?.activeRooms ?? 0,
      },
      runner: {
        languages: 8,
        supported: ["python", "javascript", "c", "cpp", "java", "rust", "go", "bash"],
        stdin: true,
        pythonPackages: ["numpy", "pandas", "sympy", "matplotlib", "requests", "bs4", "pillow"],
        sandbox,
        maxRamMb: 256,
        timeoutMs: 8_000,
        note: "self-hosted bubblewrap sandbox on the relay (no external execution API is used)",
      },
      sync: {
        service: "anonshare-sync",
        transport: "websocket (binary frames, AES-GCM sealed)",
        features: ["presence", "cursors", "edits", "chat", "file chunks", "typing indicators"],
      },
      limits: {
        ipPerMin: isVps ? 600 : 300,
        createPerMin: isVps ? 60 : 20,
        authAttemptsPerMin: 8,
        maxFileSizeMb: 25,
        maxFileChunks: 400,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
