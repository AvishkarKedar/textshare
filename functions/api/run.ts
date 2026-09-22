// Cloudflare Pages Function: /api/run
// Proxies code execution to hardened Oracle VPS sandbox at relay.avishkark.in/run
//
// Security: per-IP best-effort edge rate limit (the authoritative limit lives
// on the relay), server-side validation of language/source/stdin against the
// supported set, and generic errors — no internal detail (timeouts, DNS,
// proxy internals) is ever echoed to the client.

interface RunBody {
  language?: unknown;
  source?: unknown;
  code?: unknown;
  stdin?: unknown;
}

// Languages the VPS sandbox actually executes. Anything else is rejected
// here — before a single byte is proxied.
const LANGS = new Set([
  "python", "py", "javascript", "js", "node", "c", "cpp", "c++",
  "go", "golang", "rust", "rs", "bash", "sh", "java",
]);

const MAX_RUNS_PER_MIN = 20;
const WINDOW_MS = 60_000;

/**
 * C++ code pasted into a .c file is extremely common (tutorials, snippets).
 * gcc then dies with `fatal error: iostream: No such file or directory`.
 * Detection routes it to g++ (the C++ sandbox path) before proxying.
 */
const CPP_INCLUDE_RE =
  /#\s*include\s*<(?:iostream|bits\/stdc\+\+\.h|string|vector|map|unordered_map|multimap|set|unordered_set|queue|priority_queue|stack|deque|list|array|forward_list|memory|functional|algorithm|utility|numeric|random|regex|sstream|fstream|iomanip|chrono|thread|mutex|future|atomic|optional|variant|tuple|bitset)>/;
const CPP_HINT_RE = /(?:\busing\s+namespace\s+std\b|\bstd\s*::)/;

function looksLikeCpp(source: string): boolean {
  return CPP_INCLUDE_RE.test(source) || CPP_HINT_RE.test(source);
}

// Best-effort token bucket local to this Pages isolate. Cloudflare runs many
// isolates in parallel, so the effective ceiling is approximate — the hard
// limit is enforced on the relay itself. Sufficient to blunt single-source
// abuse without any external state.
const buckets = new Map<string, { t: number; n: number }>();

function rateLimit(ip: string, max: number): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now - b.t > WINDOW_MS) {
    if (buckets.size > 5000) buckets.clear(); // bound isolate memory
    buckets.set(ip, { t: now, n: 1 });
    return true;
  }
  b.n += 1;
  return b.n <= max;
}

function clientIp(request: Request): string {
  // CF-Connecting-IP is set by Cloudflare itself and cannot be spoofed from
  // the outside on this path.
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "anon"
  );
}

const NO_STORE = { "Cache-Control": "no-store" };

export async function onRequestPost(context: { request: Request }): Promise<Response> {
  const ip = clientIp(context.request);
  if (!rateLimit(ip, MAX_RUNS_PER_MIN)) {
    return Response.json(
      {
        ok: false,
        error: "rate_limited",
        retryAfter: 30,
        stdout: "",
        stderr: "Too many run requests from your address. Please wait a moment before trying again.",
        exitCode: 1,
        durationMs: 0,
        language: "?",
      },
      { status: 429, headers: { "Retry-After": "30", ...NO_STORE } },
    );
  }

  let body: RunBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json(
      { ok: false, stderr: "invalid JSON body", stdout: "", exitCode: 1, durationMs: 0, language: "?" },
      { status: 400, headers: NO_STORE },
    );
  }

  const rawCode = body.source ?? body.code;
  const code = typeof rawCode === "string" ? rawCode : "";
  let language = typeof body.language === "string" ? body.language.toLowerCase().trim() : "";
  const stdin = typeof body.stdin === "string" ? body.stdin : "";

  // A .c file containing C++ headers/namespaces compiles with g++, not gcc.
  if (language === "c" && code && looksLikeCpp(code)) language = "cpp";

  if (!code) {
    return Response.json(
      { ok: false, stderr: "missing source/code", stdout: "", exitCode: 1, durationMs: 0, language },
      { status: 400, headers: NO_STORE },
    );
  }
  if (code.length > 256_000) {
    return Response.json(
      { ok: false, stderr: "source too large (max 256KB)", stdout: "", exitCode: 1, durationMs: 0, language },
      { status: 413, headers: NO_STORE },
    );
  }
  if (stdin.length > 64_000) {
    return Response.json(
      { ok: false, stderr: "stdin too large (max 64KB)", stdout: "", exitCode: 1, durationMs: 0, language },
      { status: 413, headers: NO_STORE },
    );
  }
  if (!LANGS.has(language)) {
    return Response.json(
      {
        ok: false,
        error: "language_not_supported",
        stderr: `language "${language || "(none)"}" is not supported. Supported: python, javascript, c, cpp, java, rust, go, bash.`,
        stdout: "",
        exitCode: 1,
        durationMs: 0,
        language,
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const start = Date.now();
  try {
    const proxy = (lang: string) =>
      fetch("https://relay.avishkark.in/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang, code, stdin }),
        signal: AbortSignal.timeout(20000),
      });

    let res = await proxy(language);
    let data: any = await res.json().catch(() => null);

    // Safety net for C++ sources the pre-check above did not catch: a gcc
    // "fatal error: <cpp-header>: No such file" on a .c run is retried once
    // as C++ so web-copied snippets still execute.
    if (
      language === "c" &&
      data &&
      typeof data.stderr === "string" &&
      /fatal error:\s*(iostream|bits\/stdc\+\+\.h|vector|string|map|memory)\b/i.test(data.stderr)
    ) {
      language = "cpp";
      res = await proxy(language);
      data = await res.json().catch(() => null);
    }

    if (!data || typeof data !== "object") {
      return Response.json(
        {
          ok: false,
          stdout: "",
          stderr: "The code runner returned an invalid response. Please try again.",
          exitCode: 1,
          durationMs: Date.now() - start,
          language,
        },
        { status: 502, headers: NO_STORE },
      );
    }
    // Propagate the upstream status (notably 429 rate limits) instead of
    // masking everything as 200.
    const status = res.status === 429 ? 429 : 200;
    return Response.json(
      {
        ok: Boolean(data.ok),
        stdout: typeof data.stdout === "string" ? data.stdout : "",
        stderr: typeof data.stderr === "string" ? data.stderr : "",
        exitCode: typeof data.exitCode === "number" ? data.exitCode : data.ok ? 0 : 1,
        durationMs: data.executionTime || Date.now() - start,
        language,
      },
      { status, headers: NO_STORE },
    );
  } catch {
    // Generic message only — error internals (timeout vs DNS vs TLS) are
    // operational detail, not client-facing information.
    return Response.json(
      {
        ok: false,
        stdout: "",
        stderr: "The code runner is temporarily unreachable. Please try again shortly.",
        exitCode: 1,
        durationMs: Date.now() - start,
        language,
      },
      { status: 502, headers: NO_STORE },
    );
  }
}

export async function onRequestGet(): Promise<Response> {
  return Response.json(
    {
      ok: true,
      service: "anonshare-run",
      relay: "https://relay.avishkark.in/run",
      languages: ["python", "javascript", "c", "cpp", "java", "rust", "go", "bash"],
      sandbox: "bubblewrap-hardened",
    },
    { headers: NO_STORE },
  );
}
