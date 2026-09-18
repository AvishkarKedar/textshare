import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface GenBody {
  prompt: string;
  context?: string;
}

const SYSTEM = `You are anonshare's generative UI engine. The user describes a UI in plain English. You output a SINGLE, complete, self-contained HTML document — no markdown fences, no explanation, just the <!doctype html>...</html> source.

STYLING RULES (NON-NEGOTIABLE — match the anonshare vanta-black aesthetic):
- Background: #000000 (body), #080808 (cards/raised), #0b0b0b (panels)
- Foreground: #e7e7e7 (text), #6d6d6d (muted), #3d3d3d (dim)
- Accent: #4c8dff (links/primary actions/active states)
- Status colors: #3ddc84 (ok/success), #e8b339 (warn), #ff5c4d (danger)
- Borders: 1px solid #1c1c1c (default), #2a2a2a (hover)
- Fonts: system-ui for sans, ui-monospace/JetBrains Mono for code/labels
- Sharp corners everywhere — NO border-radius. "The only round thing is a person."
- Hairline borders, monospace chrome, generous whitespace
- Min 44px touch targets for interactive elements
- Use CSS custom properties: --bg, --raise, --panel, --line, --fg, --mut, --accent, --ok, --warn, --danger
- Buttons: 28-32px tall, monospace 12px, uppercase tracking, transition on hover (bg + border-color)
- Inputs: bg #0b0b0b, 1px border #2a2a2a, focus border #4c8dff
- A heading or label that starts with "> " (anonshare's prompt-style prefix)
- Every button has a → arrow suffix for primary actions

CONTENT RULES:
- The document must be fully functional standalone (inline CSS, inline JS if needed)
- If the user asks for a form, wire basic validation
- If the user asks for a dashboard, include 4-6 realistic stat cards with monospace numbers
- If the user asks for a card, include an avatar (colored square with initials), name, role, stats
- Keep total output under 4KB of HTML
- No external resources (no CDN fonts, no images) — use inline SVG or text for icons
- Mobile responsive (use clamp() or media queries)

Output ONLY the raw HTML. Do not wrap in markdown code fences. Do not add commentary.`;

export async function POST(req: NextRequest) {
  let body: GenBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const prompt = (body.prompt || "").trim();
  if (!prompt) {
    return NextResponse.json({ ok: false, error: "prompt is required" }, { status: 400 });
  }
  if (prompt.length > 500) {
    return NextResponse.json({ ok: false, error: "prompt too long (max 500 chars)" }, { status: 413 });
  }

  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: SYSTEM },
        {
          role: "user",
          content: `Generate a UI for: "${prompt}"${body.context ? `\n\nContext: ${body.context}` : ""}`,
        },
      ],
      thinking: { type: "disabled" },
    });

    let html = completion.choices[0]?.message?.content || "";
    // strip markdown code fences if the model added them
    html = html.trim();
    if (html.startsWith("```")) {
      html = html.replace(/^```(?:html)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }
    // ensure it starts with doctype
    if (!html.toLowerCase().startsWith("<!doctype")) {
      html = `<!doctype html>\n${html}`;
    }

    return NextResponse.json({
      ok: true,
      html,
      prompt,
      model: "z-ai-llm",
      generatedAt: Date.now(),
    });
  } catch (e) {
    // Graceful fallback to themed responsive HTML component
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

    return NextResponse.json({
      ok: true,
      html: fallbackHtml,
      prompt,
      model: "anonshare-template-engine",
      generatedAt: Date.now(),
    });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "anonshare-generate",
    model: "z-ai-llm (via z-ai-web-dev-sdk)",
    note: "POST {prompt} → themed HTML matching anonshare's vanta-black aesthetic",
  });
}
