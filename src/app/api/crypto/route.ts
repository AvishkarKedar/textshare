import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CryptoBody {
  code: string;
  password?: string;
}

/**
 * Demonstrates the actual anonshare key-derivation flow:
 *   key  = PBKDF2(code + ":" + password, salt = "anonshare|CODE",       600_000) → AES-GCM 256
 *   auth = PBKDF2(code + ":" + password, salt = "anonshare-auth|CODE", 600_000) → 32 bytes (relay stores SHA-256)
 *
 * The relay NEVER sees `key`. It only sees `auth`, and even then only stores
 * SHA-256(auth). This route runs entirely in the browser's WebCrypto — we
 * mirror it here on the server so the demo can SHOW the math.
 */
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

export async function POST(req: NextRequest) {
  let body: CryptoBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const code = (body.code || "").toUpperCase();
  const password = body.password || "";
  if (!code) {
    return NextResponse.json({ ok: false, error: "code is required" }, { status: 400 });
  }

  const ITERATIONS = 100_000; // 600k in prod; 100k here so the demo returns in ~1s
  const input = `${code}:${password}`;
  const keySalt = `anonshare|${code}`;
  const authSalt = `anonshare-auth|${code}`;

  const start = Date.now();
  try {
    // derive both in parallel
    const [keyBuf, authBuf, authHashBuf] = await Promise.all([
      deriveBits(input, keySalt, ITERATIONS, 256), // 256 bits = AES-GCM 256
      deriveBits(input, authSalt, ITERATIONS, 256), // 256 bits
      // also compute SHA-256(auth) to show what the relay would store
      (async () => {
        const a = await deriveBits(input, authSalt, ITERATIONS, 256);
        return globalThis.crypto.subtle.digest("SHA-256", a);
      })(),
    ]);

    return NextResponse.json({
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
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "anonshare-crypto-demo",
    algorithm: "PBKDF2-SHA-256",
    iterations: 100_000,
    note: "demonstrates the real anonshare key/auth derivation. production uses 600k iterations.",
  });
}
