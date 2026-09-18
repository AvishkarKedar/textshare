// Cloudflare Pages Function: /api/run
// Proxies code execution to hardened Oracle VPS sandbox at relay.avishkark.in/run

interface RunBody {
  language: string;
  source?: string;
  code?: string;
  stdin?: string;
}

export async function onRequestPost(context: { request: Request }): Promise<Response> {
  let body: RunBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ ok: false, stderr: "invalid JSON body", stdout: "", exitCode: 1, durationMs: 0, language: "?" }, { status: 400 });
  }

  const code = body.source || body.code || "";
  const language = (body.language || "javascript").toLowerCase().trim();
  const stdin = body.stdin || "";

  if (!code) {
    return Response.json({ ok: false, stderr: "missing source/code", stdout: "", exitCode: 1, durationMs: 0, language }, { status: 400 });
  }

  if (code.length > 256_000) {
    return Response.json({ ok: false, stderr: "source too large (max 256KB)", stdout: "", exitCode: 1, durationMs: 0, language }, { status: 413 });
  }

  const start = Date.now();
  try {
    const res = await fetch("https://relay.avishkark.in/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language,
        code,
        stdin,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data: any = await res.json();
    return Response.json({
      ok: Boolean(data.ok),
      stdout: data.stdout || "",
      stderr: data.stderr || "",
      exitCode: typeof data.exitCode === "number" ? data.exitCode : (data.ok ? 0 : 1),
      durationMs: data.executionTime || (Date.now() - start),
      language,
    });
  } catch (e: any) {
    return Response.json({
      ok: false,
      stdout: "",
      stderr: `Runner proxy error: ${e instanceof Error ? e.message : String(e)}`,
      exitCode: 1,
      durationMs: Date.now() - start,
      language,
    });
  }
}

export async function onRequestGet(): Promise<Response> {
  return Response.json({
    ok: true,
    service: "anonshare-run",
    relay: "https://relay.avishkark.in/run",
    languages: ["python", "javascript", "c", "cpp", "java", "rust", "go", "bash"],
    sandbox: "bubblewrap-hardened",
  });
}
