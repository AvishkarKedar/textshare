// Cloudflare Pages Function: /api/run
// Proxies to sandboxed execution engine (Piston) for real multi-language execution

interface RunBody {
  language: string;
  source: string;
  stdin?: string;
}

interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  language: string;
}

const PISTON_LANG_MAP: Record<string, { language: string; version: string }> = {
  javascript: { language: "javascript", version: "18.15.0" },
  js: { language: "javascript", version: "18.15.0" },
  node: { language: "javascript", version: "18.15.0" },
  typescript: { language: "typescript", version: "5.0.3" },
  ts: { language: "typescript", version: "5.0.3" },
  python: { language: "python", version: "3.10.0" },
  py: { language: "python", version: "3.10.0" },
  c: { language: "c", version: "10.2.0" },
  cpp: { language: "c++", version: "10.2.0" },
  "c++": { language: "c++", version: "10.2.0" },
  java: { language: "java", version: "15.0.2" },
  rust: { language: "rust", version: "1.68.2" },
  rs: { language: "rust", version: "1.68.2" },
  go: { language: "go", version: "1.16.2" },
  golang: { language: "go", version: "1.16.2" },
  php: { language: "php", version: "8.2.3" },
  ruby: { language: "ruby", version: "3.0.1" },
  rb: { language: "ruby", version: "3.0.1" },
  bash: { language: "bash", version: "5.2.0" },
  sh: { language: "bash", version: "5.2.0" },
};

export async function onRequestPost(context: { request: Request }): Promise<Response> {
  let body: RunBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ ok: false, stderr: "invalid JSON body", stdout: "", exitCode: 1, durationMs: 0, language: "?" }, { status: 400 });
  }

  const { language, source, stdin = "" } = body;
  if (!source || typeof source !== "string") {
    return Response.json({ ok: false, stderr: "missing source", stdout: "", exitCode: 1, durationMs: 0, language }, { status: 400 });
  }

  if (source.length > 64_000) {
    return Response.json({ ok: false, stderr: "source too large (max 64KB)", stdout: "", exitCode: 1, durationMs: 0, language }, { status: 413 });
  }

  const normalizedLang = (language || "").toLowerCase().trim();
  const langConfig = PISTON_LANG_MAP[normalizedLang] || { language: normalizedLang, version: "*" };

  const start = Date.now();
  try {
    const res = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: langConfig.language,
        version: langConfig.version,
        files: [{ content: source }],
        stdin: stdin || "",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json({
        ok: false,
        stdout: "",
        stderr: `Runner error (${res.status}): ${errText}`,
        exitCode: 1,
        durationMs: Date.now() - start,
        language: langConfig.language,
      });
    }

    const data: any = await res.json();
    const runInfo = data.run || {};
    const compileInfo = data.compile || {};

    const stdout = (runInfo.stdout || "").slice(0, 20_000);
    const stderr = (compileInfo.stderr || runInfo.stderr || compileInfo.output || "").slice(0, 20_000);
    const exitCode = typeof runInfo.code === "number" ? runInfo.code : (compileInfo.code || 0);

    return Response.json({
      ok: exitCode === 0,
      stdout,
      stderr,
      exitCode,
      durationMs: Date.now() - start,
      language: langConfig.language,
    });
  } catch (e: any) {
    return Response.json({
      ok: false,
      stdout: "",
      stderr: `Execution failed: ${e instanceof Error ? e.message : String(e)}`,
      exitCode: 1,
      durationMs: Date.now() - start,
      language: normalizedLang,
    });
  }
}

export async function onRequestGet(): Promise<Response> {
  return Response.json({
    ok: true,
    service: "anonshare-run",
    languages: Object.keys(PISTON_LANG_MAP),
    engine: "piston-sandbox",
    note: "Sandboxed execution for JavaScript, Python, C, C++, Java, Rust, Go, PHP, Ruby, Bash.",
  });
}
