// Cloudflare Pages Function: /api/crypto

interface CryptoBody {
  code?: unknown;
  password?: unknown;
}

const MAX_DERIVE_PER_MIN = 30;
const WINDOW_MS = 60_000;

// Best-effort per-IP token bucket local to this isolate. PBKDF2 at 100k
// iterations is deliberately CPU-heavy, so this endpoint is an attractive
// compute-DoS target without a guard.
const buckets = new Map<string, { t: number; n: number }>();

function rateLimit(ip: string, max: number): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now - b.t > WINDOW_MS) {
    if (buckets.size > 5000) buckets.clear();
    buckets.set(ip, { t: now, n: 1 });
    return true;
  }
  b.n += 1;
  return b.n <= max;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "anon"
  );
}

async function deriveBits(password: string, salt: string, iterations: number, len: number): Promise<ArrayBuffer> {
  const { subtle } = globalThis.crypto;
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  return subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    len,
  );
}

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost(context: { request: Request }): Promise<Response> {
  const ip = clientIp(context.request);
  if (!rateLimit(ip, MAX_DERIVE_PER_MIN)) {
    return Response.json(
      { ok: false, error: "rate_limited", retryAfter: 30 },
      { status: 429, headers: { "Retry-After": "30", "Cache-Control": "no-store" } },
    );
  }

  let body: CryptoBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const code = (typeof body.code === "string" ? body.code : "").toUpperCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[A-Z0-9]{0,12}$/.test(code)) {
    return Response.json({ ok: false, error: "code must be 0-12 letters/digits" }, { status: 400 });
  }
  if (password.length > 256) {
    return Response.json({ ok: false, error: "password too long (max 256 chars)" }, { status: 400 });
  }
  if (!code) {
    return Response.json({ ok: false, error: "code is required" }, { status: 400 });
  }

  const ITERATIONS = 100_000;
  const input = `${code}:${password}`;
  const keySalt = `anonshare|${code}`;
  const authSalt = `anonshare-auth|${code}`;

  const start = Date.now();
  try {
    const [keyBuf, authBuf, authHashBuf] = await Promise.all([
      deriveBits(input, keySalt, ITERATIONS, 256),
      deriveBits(input, authSalt, ITERATIONS, 256),
      (async () => {
        const a = await deriveBits(input, authSalt, ITERATIONS, 256);
        return globalThis.crypto.subtle.digest("SHA-256", a);
      })(),
    ]);

    return Response.json({
      ok: true,
      code,
      iterations: ITERATIONS,
      durationMs: Date.now() - start,
      key: {
        hex: bufToHex(keyBuf).slice(0, 48) + "…",
        fullHex: bufToHex(keyBuf),
        bits: 256,
        salt: keySalt,
        sentToRelay: false,
        note: "never leaves the browser — used for AES-GCM encryption",
      },
      auth: {
        hex: bufToHex(authBuf).slice(0, 48) + "…",
        bits: 256,
        salt: authSalt,
        sentToRelay: true,
        note: "sent to relay; relay stores only SHA-256(auth)",
      },
      relayStored: {
        sha256OfAuth: bufToHex(authHashBuf),
        note: "this is the ONLY thing the relay persists",
      },
      differentSalts: keySalt !== authSalt,
      derivedAt: Date.now(),
    });
  } catch {
    // Generic error — derivation internals are never echoed to clients.
    return Response.json(
      { ok: false, error: "key derivation failed" },
      { status: 500 },
    );
  }
}

export async function onRequestGet(): Promise<Response> {
  return Response.json({
    ok: true,
    service: "anonshare-crypto-demo",
    algorithm: "PBKDF2-SHA-256",
    iterations: 100_000,
    note: "demonstrates the real anonshare key/auth derivation. production uses 600k iterations.",
  });
}
