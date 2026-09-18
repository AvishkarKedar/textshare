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
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        html: "",
      },
      { status: 500 },
    );
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
