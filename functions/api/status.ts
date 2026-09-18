// Cloudflare Pages Function: /api/status

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

export async function onRequestGet(): Promise<Response> {
  const now = Date.now();
  const uptime = 3600000;

  return Response.json({
    ok: true,
    service: "anonshare",
    version: "5.1.0",
    environment: "production",
    uptime,
    uptimeHuman: formatDuration(uptime),
    timestamp: new Date().toISOString(),
    region: "auto",
    relay: {
      url: "relay.avishkark.in",
      fallback: "textshare-sync.avishkarkedar.workers.dev",
      status: "operational",
      websocketPath: "/?XTransformPort=3003",
    },
    crypto: {
      algorithm: "PBKDF2-SHA-256",
      iterations: 600_000,
      cipher: "AES-GCM-256",
      salts: 2,
      authStorage: "SHA-256(auth) only",
    },
    rooms: {
      maxConnections: 60,
      ttlOptions: ["10m", "1h", "24h"],
      note: "room counts not available in this prototype — would come from the Registry DO in production",
    },
    runner: {
      languages: 15,
      sandbox: "bubblewrap (--unshare-all --unshare-net) on self-hosted relay",
      maxRamMb: 256,
      timeoutMs: 5_000,
      fallback: "public emkc.org Piston API on open-source Worker",
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
