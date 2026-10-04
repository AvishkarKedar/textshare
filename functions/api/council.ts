// Cloudflare Pages Function: /api/council
//
// The LLM council (/llm-council slash command). Three reviewer personas
// analyse the active editor file and answer the user's question.
//
// Real AI when the Pages project has the Workers AI binding:
//   Cloudflare Pages → Settings → Bindings → AI  (or wrangler: [ai] binding = "AI")
// Without the binding this endpoint answers honestly with configured:false
// and model "" — the UI shows a "no model bound" notice and never fabricates
// reviews. (Unlike /api/generate there is no template-engine fallback here,
// so no fallback model name is claimed.)
//
// Response shape: { ok, model, configured, verdicts: [{ persona, text }] }
// Verdict text is plain text — the client renders it as text, never as HTML.

interface CouncilBody {
  question?: unknown;
  code?: unknown;
  language?: unknown;
}

const MAX_COUNCIL_PER_MIN = 6; // three model calls per request — keep it tight
const WINDOW_MS = 60_000;
const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const MAX_QUESTION = 500;
const MAX_CODE = 8000;
const MAX_LANGUAGE = 24;

// Best-effort per-IP fixed window, local to this Pages isolate (approximate
// across Cloudflare's isolate fleet — still enough to blunt abuse).
const buckets = new Map<string, { t: number; n: number }>();

function rateLimit(ip: string, max: number): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now - b.t > WINDOW_MS) {
    if (buckets.size > 5000) {
      // evict the single oldest bucket — a global clear() would let anyone
      // rotating identifiers reset every honest user's counter.
      let oldestKey: string | null = null;
      let oldestT = Infinity;
      for (const [k, v] of buckets) {
        if (v.t < oldestT) {
          oldestT = v.t;
          oldestKey = k;
        }
      }
      if (oldestKey) buckets.delete(oldestKey);
    }
    buckets.set(ip, { t: now, n: 1 });
    return true;
  }
  b.n += 1;
  return b.n <= max;
}

function clientIp(request: Request): string {
  // CF-Connecting-IP is set by Cloudflare and cannot be spoofed on Pages.
  // Everywhere else (wrangler dev, local smoke tests) one shared "anon"
  // bucket is safer than trusting client-controlled X-Forwarded-For.
  return request.headers.get("CF-Connecting-IP") || "anon";
}

type Ai = { run: (model: string, input: unknown) => Promise<{ response?: string } | string> };

const PERSONAS: { key: string; system: string }[] = [
  {
    key: "bugs",
    system:
      "You are the Bug Hunter on a code-review council. Read the file and list concrete bugs: logic errors, edge cases, off-by-ones, unhandled errors, security issues. For each: a one-line title, the line or expression involved, and a fix. If the code is correct, say so plainly and name what you checked. Max 150 words. Plain text, no markdown headers.",
  },
  {
    key: "clarity",
    system:
      "You are the Clarity Judge on a code-review council. Judge naming, structure, and readability the way a strict but fair maintainer would. Give up to 5 concrete, actionable suggestions (rename X, extract function Y, add comment for Z). Note one thing the author did well. Max 150 words. Plain text, no markdown headers.",
  },
  {
    key: "tests",
    system:
      "You are the Test Designer on a code-review council. Write 3-5 test cases (input → expected output) that would catch regressions in this file, including at least one edge case. For each, one line of rationale. Max 150 words. Plain text, no markdown headers.",
  },
];

/** Race an AI call against a deadline so one slow persona can't stall the
 *  council. The timer is always cleared so no dangling timeout keeps the
 *  isolate alive after a fast answer. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function onRequestPost(context: { request: Request; env?: unknown }): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };

  const ip = clientIp(context.request);
  if (!rateLimit(ip, MAX_COUNCIL_PER_MIN)) {
    return Response.json(
      { ok: false, error: "rate_limited", retryAfter: 30 },
      { status: 429, headers: { ...headers, "Retry-After": "30" } },
    );
  }

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers });
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return Response.json({ ok: false, error: "body must be a JSON object" }, { status: 400, headers });
  }
  const body = raw as CouncilBody;

  // strict field validation — question/language are optional, code is required
  if (body.question !== undefined && typeof body.question !== "string") {
    return Response.json({ ok: false, error: "question must be a string" }, { status: 400, headers });
  }
  if (body.language !== undefined && typeof body.language !== "string") {
    return Response.json({ ok: false, error: "language must be a string" }, { status: 400, headers });
  }
  if (typeof body.code !== "string") {
    return Response.json({ ok: false, error: "code is required" }, { status: 400, headers });
  }

  const question = (typeof body.question === "string" ? body.question : "").trim();
  const code = typeof body.code === "string" ? body.code : "";
  const language = (typeof body.language === "string" ? body.language : "").trim().slice(0, MAX_LANGUAGE) || "text";

  if (!code.trim()) {
    return Response.json({ ok: false, error: "code is required" }, { status: 400, headers });
  }
  if (question.length > MAX_QUESTION) {
    return Response.json(
      { ok: false, error: `question too long (max ${MAX_QUESTION} chars)` },
      { status: 413, headers },
    );
  }
  if (code.length > MAX_CODE) {
    return Response.json(
      { ok: false, error: `code too long (max ${MAX_CODE} chars)` },
      { status: 413, headers },
    );
  }

  const ai = (context.env as { AI?: Ai } | undefined)?.AI;
  if (!ai) {
    // Honest no-model answer: the UI turns this into the "not configured"
    // notice. Never send fabricated verdicts — and no made-up model name.
    return Response.json(
      {
        ok: true,
        configured: false,
        model: "",
        verdicts: [],
        notice:
          "No AI model is bound on this deployment. Add the Workers AI binding (Cloudflare Pages → Settings → Bindings → AI) to enable the council.",
      },
      { status: 200, headers },
    );
  }

  const userContent =
    `Language: ${language}\nQuestion: ${question || "review this file for bugs"}\n\nCode:\n${code}`;

  const settled = await Promise.all(
    PERSONAS.map(async (p) => {
      try {
        const result = await withTimeout(
          ai.run(MODEL, {
            messages: [
              { role: "system", content: p.system },
              { role: "user", content: userContent },
            ],
            max_tokens: 512,
          }),
          15_000,
        );
        if (result === null) return { persona: p.key, text: "" };
        const text = (typeof result === "string" ? result : result?.response || "").trim();
        return { persona: p.key, text };
      } catch {
        return { persona: p.key, text: "" };
      }
    }),
  );

  const verdicts = settled
    .filter((v) => v.text)
    .map((v) => ({ persona: v.persona, text: v.text.slice(0, 1200) }));

  if (verdicts.length === 0) {
    return Response.json(
      {
        ok: false,
        error: "the council timed out — try again with a smaller file",
      },
      { status: 504, headers },
    );
  }

  return Response.json(
    { ok: true, configured: true, model: MODEL, verdicts },
    { status: 200, headers },
  );
}

export async function onRequestGet(context: { env?: unknown }): Promise<Response> {
  const ai = (context.env as { AI?: unknown } | undefined)?.AI;
  return Response.json(
    {
      ok: true,
      configured: !!ai,
      model: ai ? MODEL : "",
      personas: PERSONAS.map((p) => p.key),
      note: "POST {question, code, language} → plain-text verdicts from three reviewer personas. Real LLM verdicts only when the Workers AI binding is attached; otherwise configured:false with no fabricated reviews.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
