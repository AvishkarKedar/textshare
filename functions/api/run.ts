// Cloudflare Pages Function: /api/run
// Executes user code on the public Wandbox sandbox (wandbox.org) — the same
// class of third-party public runner this app used before the private VPS
// sandbox existed (the earlier emkc.org Piston API went whitelist-only in
// Feb 2026; the Oracle VPS sandbox was terminated in Oct 2026).
//
// Security: per-IP best-effort edge rate limit (the authoritative limit lives
// on Wandbox), server-side validation of language/source/stdin against the
// supported set, size caps, a 25s hard timeout, and generic errors — no
// internal detail (timeouts, DNS, proxy internals) is ever echoed to the
// client. Code sent here is NOT end-to-end encrypted (a runner must read it
// to execute it — identical to the previous Piston/VPS runners).

interface RunBody {
  language?: unknown;
  source?: unknown;
  code?: unknown;
  stdin?: unknown;
}

// Supported execution languages, normalized. The run button in the editor
// only ever offers these; anything else is rejected before any network I/O.
const LANGS = new Set([
  "python", "py", "javascript", "js", "node", "typescript", "ts", "c", "cpp", "c++",
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
// limit is enforced upstream. Sufficient to blunt single-source abuse
// without any external state.
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

/* ----------------------------------------------------------- Wandbox map */
//
// Pinned compilers are tried first; if Wandbox retires one (version churn),
// the language list is re-fetched (cached 6h per isolate) and the newest
// entry matching the family regex is used instead. That keeps runs alive
// across Wandbox version refreshes without a redeploy.

const WANDBOX: Record<string, { language: string; pinned: string; family: RegExp }> = {
  python: { language: "Python", pinned: "cpython-3.12.7", family: /^cpython-3\.\d+/ },
  javascript: { language: "JavaScript", pinned: "nodejs-20.17.0", family: /^nodejs-\d+/ },
  typescript: { language: "TypeScript", pinned: "typescript-5.6.2", family: /^typescript-\d+/ },
  c: { language: "C", pinned: "gcc-13.2.0-c", family: /^gcc-\d[\d.]*-c$|^clang-\d[\d.]*-c$/ },
  cpp: { language: "C++", pinned: "gcc-13.2.0", family: /^gcc-\d[\d.]*$|^clang-\d[\d.]*$/ },
  go: { language: "Go", pinned: "go-1.23.2", family: /^go-1\.\d+/ },
  rust: { language: "Rust", pinned: "rust-1.82.0", family: /^rust-1\.\d+/ },
  java: { language: "Java", pinned: "openjdk-jdk-22+36", family: /^openjdk-jdk-\d+/ },
  bash: { language: "Bash script", pinned: "bash", family: /^bash/ },
};

interface WandboxListEntry {
  name?: unknown;
  language?: unknown;
}

let compilerCache: { at: number; byLang: Map<string, string[]> } | null = null;

async function wandboxCompilerList(): Promise<Map<string, string[]>> {
  if (compilerCache && Date.now() - compilerCache.at < 6 * 3600_000) {
    return compilerCache.byLang;
  }
  try {
    const res = await fetch("https://wandbox.org/api/list.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const list = (await res.json()) as WandboxListEntry[];
      const byLang = new Map<string, string[]>();
      for (const entry of list) {
        if (typeof entry?.name !== "string" || typeof entry?.language !== "string") continue;
        const arr = byLang.get(entry.language);
        if (arr) arr.push(entry.name);
        else byLang.set(entry.language, [entry.name]);
      }
      compilerCache = { at: Date.now(), byLang };
    }
  } catch {
    // Keep the previous cache if the refresh fails; pinned names still work.
  }
  return compilerCache?.byLang ?? new Map();
}

// "gcc-13.2.0" -> 13.2.0 -> 130200000 : comparable version numbers.
function versionKey(name: string): number {
  const nums = (name.match(/\d+/g) || []).slice(0, 4).map(Number);
  return nums.reduce((acc, n) => acc * 1000 + n, 0);
}

async function resolveCompiler(language: string): Promise<string | null> {
  const spec = WANDBOX[language];
  if (!spec) return null;
  const names = (await wandboxCompilerList()).get(spec.language);
  if (!names || !names.length) return spec.pinned; // list unavailable — pin and hope
  if (names.includes(spec.pinned)) return spec.pinned;
  const family = names.filter((n) => spec.family.test(n) && !n.includes("head"));
  if (family.length) {
    family.sort((a, b) => versionKey(a) - versionKey(b));
    return family[family.length - 1];
  }
  const head = names.find((n) => n.endsWith("-head") || n === "bash");
  return head ?? spec.pinned;
}

interface WandboxResult {
  status?: unknown;
  signal?: unknown;
  compiler_error?: unknown;
  program_output?: unknown;
  program_error?: unknown;
}

/** One Wandbox execution. Returns the relay-style contract the terminal reads. */
async function runOnWandbox(
  language: string,
  code: string,
  stdin: string,
): Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number } | null> {
  const compiler = await resolveCompiler(language);
  if (!compiler) return null;
  try {
    const res = await fetch("https://wandbox.org/api/compile.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, compiler, stdin, save: false }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null; // upstream outage — surfaced as the generic 502
    const data = (await res.json().catch(() => null)) as WandboxResult | null;
    if (!data || typeof data !== "object") return null;
    const exit = Number.parseInt(String(data.status ?? ""), 10);
    const exitCode = Number.isFinite(exit) ? exit : data.signal ? 137 : 1;
    const compileErr = typeof data.compiler_error === "string" ? data.compiler_error : "";
    const progOut = typeof data.program_output === "string" ? data.program_output : "";
    const progErr = typeof data.program_error === "string" ? data.program_error : "";
    const stderr = [compileErr, progErr].filter(Boolean).join("\n");
    return { ok: exitCode === 0 && !compileErr, stdout: progOut, stderr, exitCode };
  } catch {
    return null;
  }
}

const runError = (
  stderr: string,
  language: string,
  durationMs: number,
  status = 502,
) =>
  Response.json(
    { ok: false, stdout: "", stderr, exitCode: 1, durationMs, language },
    { status, headers: NO_STORE },
  );

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

  // Normalize aliases before validation (py->python, c++->cpp, …).
  if (language === "py") language = "python";
  if (language === "js" || language === "node") language = "javascript";
  if (language === "ts") language = "typescript";
  if (language === "golang") language = "go";
  if (language === "rs") language = "rust";
  if (language === "sh") language = "bash";
  if (language === "c++") language = "cpp";

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
        stderr: `language "${language || "(none)"}" is not supported. Supported: python, javascript, typescript, c, cpp, java, rust, go, bash.`,
        stdout: "",
        exitCode: 1,
        durationMs: 0,
        language,
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const start = Date.now();
  let result = await runOnWandbox(language, code, stdin);

  // Safety net for C++ sources the pre-check above did not catch: a gcc
  // "fatal error: <cpp-header>: No such file" on a .c run is retried once
  // as C++ so web-copied snippets still execute.
  if (
    language === "c" &&
    result &&
    typeof result.stderr === "string" &&
    /fatal error:\s*(iostream|bits\/stdc\+\+\.h|vector|string|map|memory)\b/i.test(result.stderr)
  ) {
    language = "cpp";
    result = await runOnWandbox(language, code, stdin);
  }

  if (!result) {
    return runError("The code runner is temporarily unavailable. Please try again shortly.", language, Date.now() - start);
  }

  return Response.json(
    {
      ok: result.ok,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: Date.now() - start,
      language,
    },
    { status: 200, headers: NO_STORE },
  );
}

export async function onRequestGet(): Promise<Response> {
  return Response.json(
    {
      ok: true,
      service: "anonshare-run",
      runner: "wandbox.org (public sandbox)",
      languages: ["python", "javascript", "typescript", "c", "cpp", "java", "rust", "go", "bash"],
      // Python stdlib always included; third-party packages are NOT
      // preinstalled on the public runner (the previous private runner
      // bundled numpy/pandas/etc. — do not rely on them here).
      packages: [],
      stdin: "supported — one line per input() / scanf / cin read",
    },
    { headers: NO_STORE },
  );
}
