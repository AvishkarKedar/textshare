"use client";

/**
 * /llm-council — a panel of AI reviewer personas analyses the active file.
 *
 * The server (functions/api/council.ts on Cloudflare Pages, or the local
 * dev route) runs one call per persona and returns plain-text verdicts plus
 * the model that actually answered. When no AI model is bound, the server
 * says so (configured:false) and this modal shows the honest notice — never
 * a fabricated review.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Loader2, Play, Bug, Gauge, FlaskConical, Info } from "lucide-react";
import { useAnon, type CouncilVerdict } from "@/lib/store";

const PERSONAS: { key: string; label: string; icon: typeof Bug; blurb: string }[] = [
  { key: "bugs", label: "Bug hunter", icon: Bug, blurb: "finds logic errors, edge cases, and crash paths" },
  { key: "clarity", label: "Clarity judge", icon: Gauge, blurb: "names, structure, and what a maintainer would wince at" },
  { key: "tests", label: "Test designer", icon: FlaskConical, blurb: "writes the test cases that would catch regressions" },
];

export function CouncilModal() {
  const s = useAnon();
  // true once the user convenes the council this opening — lets us show an
  // inline "could not meet" notice when a run ends with no verdicts and no
  // not-configured answer (network error / timeout; the store also pushes a
  // notification with the details).
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (s.councilOpen) setAttempted(false);
  }, [s.councilOpen]);

  // Esc closes the modal (blocked while the council is running)
  useEffect(() => {
    if (!s.councilOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const st = useAnon.getState();
        if (st.councilRunning) return;
        e.preventDefault();
        st.toggleCouncil();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s.councilOpen]);

  if (!s.councilOpen) return null;

  const file = s.files.find((f) => f.id === s.activeFileId);
  const failedRun =
    attempted && !s.councilRunning && s.councilVerdicts.length === 0 && s.councilConfigured;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="LLM council"
        onClick={() => { if (!s.councilRunning) s.toggleCouncil(); }}
      >
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.99 }}
          transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[85vh] w-full max-w-lg flex-col bg-[var(--anon-panel)] hairline shadow-2xl shadow-black/50"
        >
          {/* header */}
          <div className="flex h-11 flex-none items-center justify-between hairline-b px-4">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 anon-accent" /> LLM council
              {file && <span className="anon-mono ml-1 truncate text-[10px] anon-mut">{file.name}</span>}
            </h2>
            <button
              onClick={() => { if (!s.councilRunning) s.toggleCouncil(); }}
              className="anon-mut hover:anon-fg"
              aria-label="Close council"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {!file ? (
              <p className="anon-mono text-xs anon-mut">open a file first — the council reviews the active editor file.</p>
            ) : (
              <>
                {/* personas */}
                <ul className={`flex flex-col gap-1.5 ${s.councilRunning ? "opacity-50" : ""}`}>
                  {PERSONAS.map((p) => (
                    <li key={p.key} className="flex items-center gap-2.5 hairline bg-[var(--anon-raise)] px-3 py-2">
                      <p.icon className="h-4 w-4 flex-none anon-accent" />
                      <div className="min-w-0">
                        <div className="anon-mono text-[11px] anon-fg">{p.label}</div>
                        <div className="anon-mono truncate text-[9.5px] anon-mut">{p.blurb}</div>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* question */}
                <label className="mt-3 flex flex-col gap-1.5">
                  <span className="anon-mono text-[10px] uppercase tracking-wider anon-dim">question for the council</span>
                  <input
                    type="text"
                    value={s.councilQuestion}
                    onChange={(e) => s.setCouncilQuestion(e.target.value)}
                    placeholder="review this file for bugs"
                    maxLength={500}
                    disabled={s.councilRunning}
                    autoFocus
                    className="anon-mono h-10 bg-[var(--anon-bg)] hairline px-3 text-sm anon-fg outline-none focus:border-[var(--anon-accent)] disabled:opacity-50"
                  />
                </label>

                {/* running indicator */}
                {s.councilRunning && (
                  <div className="mt-3 flex items-center justify-center gap-2 hairline bg-[var(--anon-raise)] px-3 py-2.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin anon-accent" />
                    <p className="anon-mono text-[10px] anon-mut">
                      three reviewers are reading the file…
                    </p>
                  </div>
                )}

                {/* honest not-configured notice */}
                {!s.councilConfigured && !s.councilRunning && (
                  <div className="mt-3 flex items-start gap-2 hairline bg-[var(--anon-raise)] px-3 py-2.5">
                    <Info className="h-4 w-4 flex-none anon-warn" />
                    <p className="anon-mono text-[10px] anon-mut">
                      no AI model is bound on this deployment — the council refuses to
                      invent reviews. Add the <span className="anon-fg">Workers AI</span> binding
                      (Cloudflare Pages · Settings · Bindings · <span className="anon-fg">AI</span>) to
                      enable it. Everything else in the app keeps working.
                    </p>
                  </div>
                )}

                {/* failed-run notice (network error / timeout — details in
                    the notifications panel) */}
                {failedRun && (
                  <div className="mt-3 flex items-start gap-2 hairline bg-[var(--anon-raise)] px-3 py-2.5">
                    <Info className="h-4 w-4 flex-none anon-warn" />
                    <p className="anon-mono text-[10px] anon-mut">
                      the council could not meet — the request failed or timed out.
                      try again in a moment; details are in the notifications panel.
                    </p>
                  </div>
                )}

                {/* verdicts — plain text only; React escapes the content, so
                    verdict text can never render as HTML */}
                {s.councilVerdicts.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2">
                    {s.councilVerdicts.map((v: CouncilVerdict, i) => {
                      const meta =
                        PERSONAS.find((p) => p.key === (v as { persona?: string }).persona) ??
                        PERSONAS[i % PERSONAS.length];
                      return (
                        <li key={i} className="hairline bg-[var(--anon-raise)]">
                          <div className="flex items-center gap-2 hairline-b px-3 py-1.5">
                            <meta.icon className="h-3.5 w-3.5 anon-accent" />
                            <span className="anon-mono text-[10px] uppercase tracking-wider anon-fg">{meta.label}</span>
                          </div>
                          <pre className="anon-mono overflow-x-auto px-3 py-2.5 text-[10.5px] leading-relaxed anon-mut whitespace-pre-wrap break-words">{v.text}</pre>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {s.councilModel && s.councilConfigured && (
                  <p className="anon-mono mt-2 text-center text-[9px] anon-dim">
                    answered by {s.councilModel}
                  </p>
                )}
              </>
            )}
          </div>

          {/* footer */}
          {file && (
            <div className="flex-none hairline-t p-3">
              <button
                onClick={() => { setAttempted(true); void s.runCouncil(); }}
                disabled={s.councilRunning || !file.content.trim()}
                className="anon-mono inline-flex h-10 w-full items-center justify-center gap-2 bg-[var(--anon-accent)] px-4 text-sm font-medium text-[var(--anon-accent-fg)] transition-transform hover:brightness-110 active:translate-y-px disabled:opacity-60"
              >
                {s.councilRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> the council is deliberating…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" /> convene the council
                  </>
                )}
              </button>
              {/* honesty first: the room is E2EE, but this one feature reads
                  the active file and sends it (plain text) to the AI model.
                  The user must know before pressing the button. */}
              <p className="anon-mono mt-1.5 text-center text-[9px] anon-dim">
                sends the active file (plain text, first 8 KB) to the AI model — skip it for secrets
              </p>
              {!file.content.trim() && (
                <p className="anon-mono mt-1.5 text-center text-[9px] anon-dim">
                  the active file is empty — write or paste some code first
                </p>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
