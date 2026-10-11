// Cloudflare Pages Function: /api/relay/*
//
// Same-origin REST proxy for the anonshare sync relays. The browser client
// never calls the relay cross-origin: every REST request (room create/join
// preflight, /exists, /health probe, admin, file chunk PUT/GET/DELETE) is
// issued same-origin to /api/relay/u/<relay-host><path> and forwarded here.
//
// Why this exists (regression 2026-10): while the site was temporarily served
// from data.avishkark.in, every relay REST call failed CORS — the Worker's
// allowlist only had the canonical origin. Same-origin proxying removes the
// relay's CORS allowlist from the coupling set entirely: any origin the Pages
// project is ever served from (code.avishkark.in, future custom domains,
// *.pages.dev previews) works with zero relay-side changes. WebSockets are
// not subject to CORS and still connect to the relay directly.
//
// Security posture:
//   - STRICT host allowlist below — this function must never become an open
//     proxy (SSRF). Only the two production relays are reachable, both https.
//   - Only the relay-relevant request headers are forwarded (content-type,
//     x-room-auth, authorization, range). Cookies and anything else the relay
//     does not need are dropped.
//   - Response body is passed through untouched with its content-type (JSON
//     or file-chunk octet-stream), always no-store.
//
// Rate-limit note: the relay's per-IP limits (Limiter Durable Object) key on
// CF-Connecting-IP as seen by the relay, which for proxied requests is the
// Pages egress, not the browser's IP. Effective shared ceilings are therefore
// IP_PER_MIN=300 / CREATE_PER_MIN=20 across all proxied traffic — the admin
// dashboard can raise both at runtime if traffic ever justifies it.

interface PagesContext {
  request: Request;
  params: { path?: string | string[] };
}

const ALLOWED_HOSTS = new Set([
  "textshare-sync.avishkarkedar.workers.dev", // primary relay (Cloudflare Worker)
  "relay.avishkark.in", // fallback relay (VPS; kept for when it returns)
]);

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "DELETE"]);

const FORWARD_HEADERS = ["content-type", "x-room-auth", "authorization", "range"];

const NO_STORE = { "Cache-Control": "no-store" };

const bad = (status: number, error: string) =>
  Response.json({ ok: false, error }, { status, headers: NO_STORE });

export async function onRequest(context: PagesContext): Promise<Response> {
  const req = context.request;

  // Same-origin fetch — browsers do not preflight these, but answer OPTIONS
  // plainly in case anything ever asks.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: NO_STORE });
  }

  if (!ALLOWED_METHODS.has(req.method)) {
    return bad(405, "method_not_allowed");
  }

  // params.path arrives URL-decoded, one entry per path segment. Re-encode
  // each segment on rebuild so nothing (a %2F, a stray %) can alter the path
  // structure between the browser and the relay.
  const raw = context.params.path;
  const segments = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((s) => decodeURIComponent(s));
  if (segments[0] !== "u" || segments.length < 2) {
    return bad(404, "not_found");
  }

  const host = segments[1].toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    // Not an allowed relay — refuse before any network I/O happens.
    return bad(403, "relay_not_allowed");
  }

  const rest = segments.slice(2).map((s) => encodeURIComponent(s)).join("/");
  if (!rest) return bad(404, "not_found");

  // Query string is copied verbatim from the original request (room create
  // carries the auth/owner tokens, ttl, p in the query).
  const incoming = new URL(req.url);
  const upstream = new URL(`https://${host}/${rest}`);
  upstream.search = incoming.search;

  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Manual AbortController (not AbortSignal.timeout — on the Cloudflare
  // Workers runtime that variant can surface a runtime-level 502 page
  // instead of a catchable rejection; see functions/api/run.ts).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
    signal: ctrl.signal,
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  try {
    const res = await fetch(upstream.toString(), init);
    const out = new Headers(NO_STORE);
    const type = res.headers.get("content-type");
    if (type) out.set("content-type", type);
    return new Response(res.body, { status: res.status, headers: out });
  } catch {
    // Timeout / network failure upstream — generic, no internals echoed.
    return bad(502, "relay_unreachable");
  } finally {
    clearTimeout(timer);
  }
}
