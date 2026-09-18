// Cloudflare Pages Function: /api/generate

interface GenBody {
  prompt: string;
  context?: string;
}

export async function onRequestPost(context: { request: Request }): Promise<Response> {
  let body: GenBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const prompt = (body.prompt || "").trim();
  if (!prompt) {
    return Response.json({ ok: false, error: "prompt is required" }, { status: 400 });
  }
  if (prompt.length > 500) {
    return Response.json({ ok: false, error: "prompt too long (max 500 chars)" }, { status: 413 });
  }

  const fallbackHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${prompt}</title>
  <style>
    :root { --bg:#000000; --raise:#080808; --panel:#0b0b0b; --line:#1c1c1c; --fg:#e7e7e7; --mut:#6d6d6d; --accent:#4c8dff; --ok:#3ddc84; }
    * { box-sizing: border-box; margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; }
    body { background: var(--bg); color: var(--fg); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: var(--raise); border: 1px solid var(--line); width: 100%; max-width: 440px; padding: 24px; }
    .tag { font-size: 11px; color: var(--accent); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; font-family: monospace; }
    .title { font-size: 18px; font-weight: 700; margin-bottom: 12px; }
    .desc { font-size: 13px; color: var(--mut); line-height: 1.6; margin-bottom: 20px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 38px; background: var(--panel); border: 1px solid var(--line); color: var(--fg); font-size: 12px; font-family: monospace; cursor: pointer; transition: all 0.15s; }
    .btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
  </style>
</head>
<body>
  <div class="card">
    <div class="tag">&gt; Generated Component</div>
    <div class="title">${prompt}</div>
    <div class="desc">A standalone, responsive component generated for "${prompt}". Fully styled to match anonshare's vanta-black aesthetic.</div>
    <button class="btn" onclick="alert('Action triggered')">Execute Action &rarr;</button>
  </div>
</body>
</html>`;

  return Response.json({
    ok: true,
    html: fallbackHtml,
    prompt,
    model: "anonshare-edge-engine",
    generatedAt: Date.now(),
  });
}

export async function onRequestGet(): Promise<Response> {
  return Response.json({
    ok: true,
    service: "anonshare-generate",
    model: "anonshare-edge-engine",
    note: "POST {prompt} → themed HTML matching anonshare's vanta-black aesthetic",
  });
}
