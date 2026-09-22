#!/usr/bin/env node
/**
 * Live endpoint verification against production:
 *   - code.avishkark.in  (Pages site + /api/* functions)
 *   - relay.avishkark.in (VPS relay — runs OLD code until user redeploys)
 *
 * "See logics and see if endpoint exists and properly connected" — checks
 * every endpoint the client actually calls, plus the security posture of
 * the newly deployed functions.
 */
const PAGES = "https://code.avishkark.in";
const RELAY = "https://relay.avishkark.in";

let pass = 0, fail = 0;
const out = [];
function check(name, cond, detail = "") {
  if (cond) { pass++; out.push(`  ✓ ${name}`); }
  else { fail++; out.push(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
}

async function j(url, init) {
  try {
    const t0 = Date.now();
    const res = await fetch(url, init);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, headers: res.headers, json, text, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, headers: null, json: null, text: String(e), ms: 0 };
  }
}

async function main() {
  console.log(`\n=== LIVE endpoint verification ${new Date().toISOString()} ===\n`);

  /* ---- Pages site ---- */
  let r = await j(`${PAGES}/`);
  check("GET / (site) → 200 HTML", r.status === 200 && /<html|<!doctype/i.test(r.text));
  check("site has CSP header (via _headers)", (r.headers.get("content-security-policy") || "").length > 20);
  check("site has HSTS", !!r.headers.get("strict-transport-security"));
  check("site has nosniff", r.headers.get("x-content-type-options") === "nosniff");

  r = await j(`${PAGES}/api`);
  check("GET /api → endpoint index", r.status === 200 && r.json?.ok === true && Array.isArray(r.json?.endpoints));
  check("/api version is 5.2.0 (fresh deploy)", r.json?.version === "5.2.0", `got ${r.json?.version}`);

  r = await j(`${PAGES}/api/status`);
  check("GET /api/status → 200, actually probes relay", r.status === 200 && r.json?.relay?.probed === true);
  check("/api/status relay status honest", ["operational", "unreachable"].includes(r.json?.relay?.status));
  check("/api/status uptime is dynamic (>0 or unknown)", typeof r.json?.relay?.uptime === "number");
  check("/api/status reports rooms/peers numbers", typeof r.json?.relay?.activeRooms === "number" && typeof r.json?.relay?.connectedPeers === "number");

  r = await j(`${PAGES}/api/run`);
  check("GET /api/run → language list", r.status === 200 && Array.isArray(r.json?.languages) && r.json?.languages.length === 8);

  r = await j(`${PAGES}/api/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: "python", code: "print(6*7)" }) });
  check("POST /api/run → real execution (python)", r.status === 200 && r.json?.ok === true && (r.json?.stdout || "").includes("42"));

  r = await j(`${PAGES}/api/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: "cobol", code: "x" }) });
  check("POST /api/run rejects unsupported language (400)", r.status === 400 && r.json?.error === "language_not_supported",
    `got ${r.status} ${r.json?.error}`);

  r = await j(`${PAGES}/api/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: "python", code: { obj: true } }) });
  check("POST /api/run rejects non-string code (400)", r.status === 400, `got ${r.status}`);

  r = await j(`${PAGES}/api/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "garbage{" });
  check("POST /api/run rejects malformed JSON (400)", r.status === 400);

  r = await j(`${PAGES}/api/generate`);
  check("GET /api/generate → honest model descriptor", r.status === 200 && typeof r.json?.model === "string");

  r = await j(`${PAGES}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: 'a <b>bold</b> card <img src=x onerror="alert(1)">' }) });
  const html = r.json?.html || "";
  check("POST /api/generate → 200 with HTML", r.status === 200 && html.includes("<!doctype html"));
  check("POST /api/generate escapes prompt (no raw <img>)", !html.includes("<img src=x"), "XSS leaked into template!");
  check("POST /api/generate labels template honestly", r.json?.model === "anonshare-template-engine" || (r.json?.model || "").includes("llama"));

  r = await j(`${PAGES}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "x".repeat(600) }) });
  check("POST /api/generate rejects >500 char prompt (413)", r.status === 413);

  r = await j(`${PAGES}/api/crypto`);
  check("GET /api/crypto → descriptor", r.status === 200 && r.json?.algorithm === "PBKDF2-SHA-256");

  r = await j(`${PAGES}/api/crypto`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "ABC123", password: "pw" }) });
  check("POST /api/crypto → real derivation", r.status === 200 && r.json?.ok === true && r.json?.relayStored?.sha256OfAuth?.length === 64);

  r = await j(`${PAGES}/api/crypto`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "BAD CODE!", password: "pw" }) });
  check("POST /api/crypto rejects invalid code (400)", r.status === 400, `got ${r.status}`);

  r = await j(`${PAGES}/api/nonexistent`);
  check("unknown /api route → 404 (no leak)", r.status === 404);

  /* ---- VPS relay (runs OLD code until user redeploys!) ---- */
  r = await j(`${RELAY}/health`);
  check("relay /health → 200", r.status === 200 && r.json?.ok === true);
  check("relay sandbox hardened", (r.json?.sandbox || "").includes("bwrap"));

  r = await j(`${RELAY}/health/stats`);
  check("relay /health/stats → live metrics", r.status === 200 && typeof r.json?.uptime === "number" && typeof r.json?.activeRooms === "number");

  // room lifecycle (the endpoints the client actually calls)
  const code = "LIVE" + Math.floor(Math.random() * 900 + 100);
  r = await j(`${RELAY}/room/${code}?create=1&excl=1&a=liveauth&o=liveowner&ttl=10m`);
  check("relay room create preflight → 426", r.status === 426 && r.json?.ok === true);

  r = await j(`${RELAY}/room/${code}/exists`);
  check("relay room exists → true", r.json?.exists === true && r.json?.auth === true);

  r = await j(`${RELAY}/room/${code}?a=wrong`);
  check("relay join wrong auth → 403", r.status === 403);

  r = await j(`${RELAY}/room/${code}?a=liveauth`);
  check("relay join correct auth → 426", r.status === 426);

  // file chunk roundtrip (auth via header)
  r = await j(`${RELAY}/room/${code}/files/livef1/chunk/0`, { method: "PUT", headers: { Authorization: "Bearer liveauth", "Content-Type": "application/octet-stream" }, body: "chunkdata" });
  const newRelay = r.json?.error === "rate_limited" ? "rate" : r.status; // old code may not rate limit
  r = await j(`${RELAY}/room/${code}/files/livef1/chunk/0`, { headers: { Authorization: "Bearer liveauth" } });
  check("relay file chunk roundtrip (PUT→GET)", r.status === 200 && r.text === "chunkdata", `status ${newRelay}`);

  // DELETE file — should be 404 on OLD code (the bug), 200 on NEW code
  r = await j(`${RELAY}/room/${code}/files/livef1`, { method: "DELETE", headers: { Authorization: "Bearer liveauth" } });
  check("relay file DELETE endpoint reachable", r.status !== 0, `status ${r.status} (200 = new code deployed, 404 = old code, bug fixed in repo)`);

  // admin state on production — OLD code: leaked default password still valid
  r = await j(`${RELAY}/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "Avishkar@44332297768" }) });
  if (r.status === 200) {
    check("⚠️  PRODUCTION relay still accepts the LEAKED password (old code running — redeploy required!)", false, "token issued");
  } else if (r.status === 503) {
    check("relay admin disabled (503) — new code deployed", true);
  } else {
    check("relay admin login rejects leaked password (rotated or new code)", r.status === 403 || r.status === 429, `got ${r.status}`);
  }

  // CORS on production relay (old code = wildcard; new = allowlist)
  r = await j(`${RELAY}/health`, { headers: { Origin: "https://evil.example.org" } });
  const acao = r.headers.get("access-control-allow-origin");
  if (acao === "*") {
    check("⚠️  relay CORS still wildcard (old code running — redeploy required!)", false, "ACAO: *");
  } else {
    check("relay CORS restricted (no wildcard grant to evil origin)", acao === null || acao !== "*");
  }

  console.log(out.join("\n"));
  console.log(`\n=== ${pass} passed, ${fail} flagged/failed ===\n`);
}

main().catch(e => { console.error("verification crashed:", e); process.exit(2); });
