// Cloudflare Pages Function: /api/generate
//
// Real generative UI when the Pages project has the Workers AI binding
// (add `AI` binding in Cloudflare Pages → Settings → Bindings, or in
// wrangler.toml: [ai] binding = "AI"). Returns honest model metadata:
//   - model "@cf/meta/llama-3.1-8b-instruct" → real LLM output
//   - model "anonshare-template-engine"      → deterministic template
//     fallback (labeled as such in the UI — never presented as AI)

interface GenBody {
  prompt?: unknown;
  context?: unknown;
}

const MAX_GEN_PER_MIN = 10;
const WINDOW_MS = 60_000;

// Best-effort per-IP token bucket local to this Pages isolate (approximate
// across Cloudflare's isolate fleet — still enough to blunt abuse).
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

// HTML-escape a string so user prompts can never break out of the generated
// document's text nodes or attributes (XSS hardening).
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const SYSTEM_PROMPT = `You are a UI component generator. The user describes a component; you return ONE complete, standalone HTML document and NOTHING else — no markdown fences, no commentary, no explanation.

Rules:
- Start with <!doctype html> and end with </html>
- Dark, minimal, terminal-inspired aesthetic: background #000000, panels #080808/#0b0b0b, 1px #1c1c1c borders, text #e7e7e7, muted #6d6d6d, accent #4c8dff
- Monospace for chrome/labels (font-family: monospace), system sans for body copy
- Sharp corners everywhere (border-radius: 0), no shadows or gradients
- Fully responsive, mobile-first, real interactive behavior with inline <script>
- Include real content matching the request (not lorem ipsum)`;

function extractHtml(raw: string): string | null {
  let text = raw.trim();
  // strip markdown code fences if the model added them
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.search(/<!doctype html>|<html/i);
  if (start === -1) return null;
  const end = text.toLowerCase().lastIndexOf("</html>");
  if (end === -1) return null;
  return text.slice(start, end + 7);
}

export async function onRequestPost(context: { request: Request; env?: unknown }): Promise<Response> {
  const ip = clientIp(context.request);
  if (!rateLimit(ip, MAX_GEN_PER_MIN)) {
    return Response.json(
      { ok: false, error: "rate_limited", retryAfter: 30 },
      { status: 429, headers: { "Retry-After": "30", "Cache-Control": "no-store" } },
    );
  }

  let body: GenBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const prompt = (typeof body.prompt === "string" ? body.prompt : "").trim();
  if (!prompt) {
    return Response.json({ ok: false, error: "prompt is required" }, { status: 400 });
  }
  if (prompt.length > 500) {
    return Response.json({ ok: false, error: "prompt too long (max 500 chars)" }, { status: 413 });
  }
  const userContext =
    typeof body.context === "string" ? body.context.slice(0, 800) : "";

  // 1. Real LLM via Workers AI binding (if configured)
  const ai = (context.env as { AI?: { run: (model: string, input: unknown) => Promise<{ response?: string } | string> } } | undefined)?.AI;
  if (ai) {
    try {
      const result = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt + (userContext ? `\n\nContext: ${userContext}` : "") },
        ],
        max_tokens: 2048,
      });
      const text = typeof result === "string" ? result : result?.response || "";
      const html = extractHtml(text);
      if (html && html.length > 80) {
        return Response.json({
          ok: true,
          html,
          prompt,
          model: "@cf/meta/llama-3.1-8b-instruct",
          generatedAt: Date.now(),
        });
      }
    } catch {
      // fall through to the honest template generator
    }
  }

  // 2. Deterministic template fallback — labeled honestly, never as AI.
  // The prompt is HTML-escaped before interpolation so it can never inject
  // markup into the generated document.
  const safePrompt = esc(prompt);
  const fallbackHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safePrompt}</title>
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
    <div class="tag">&gt; Template Component</div>
    <div class="title">${safePrompt}</div>
    <div class="desc">Generated from the deterministic template engine (no AI model is configured on this deployment). Add the Workers AI binding to enable real LLM generation.</div>
    <button class="btn" onclick="alert('Action triggered')">Execute Action &rarr;</button>
  </div>
</body>
</html>`;

  return Response.json({
    ok: true,
    html: fallbackHtml,
    prompt,
    model: "anonshare-template-engine",
    generatedAt: Date.now(),
  });
}

export async function onRequestGet(context: { env?: unknown }): Promise<Response> {
  const ai = (context.env as { AI?: unknown } | undefined)?.AI;
  return Response.json({
    ok: true,
    service: "anonshare-generate",
    model: ai ? "@cf/meta/llama-3.1-8b-instruct (Workers AI)" : "anonshare-template-engine",
    note: "POST {prompt} → HTML. Real LLM output when the Workers AI binding is attached; otherwise a deterministic, honestly-labeled template.",
  });
}
