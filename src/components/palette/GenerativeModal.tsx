"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Sparkles,
  Loader2,
  Copy,
  FilePlus2,
  ExternalLink,
  Wand2,
  Zap,
} from "lucide-react";
import { useAnon } from "@/lib/store";
import { toast } from "sonner";

const PRESETS = [
  "login form",
  "dashboard with stats",
  "contact form",
  "profile card",
  "top nav bar",
  "sidebar menu",
  "pricing table",
  "feature grid",
  "footer",
];

export function GenerativeModal() {
  const s = useAnon();
  if (!s.generativeOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={() => s.toggleGenerative()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-[80vh] w-full max-w-4xl flex-col hairline anon-panel shadow-2xl shadow-black/50"
        >
          {/* header */}
          <div className="flex h-10 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              <Wand2 className="h-4 w-4 anon-accent" /> Generative UI
            </h2>
            <span className="anon-mono text-[10px] anon-dim hidden sm:inline">
              describe a UI → get themed HTML (template or AI)
            </span>
            <button onClick={() => s.toggleGenerative()} className="anon-mut hover:anon-fg">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* prompt input */}
          <div className="hairline-b p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={s.generativePrompt}
                onChange={(e) => s.setGenerativePrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    s.generateUi();
                  }
                }}
                placeholder="describe a UI: 'a login form with email and password'"
                className="anon-mono flex-1 bg-[var(--anon-bg)] hairline px-3 py-2 text-sm outline-none focus:border-[var(--anon-accent)]"
                autoFocus
              />
              <button
                onClick={() => s.generateUi()}
                disabled={!s.generativePrompt.trim()}
                className="anon-mono inline-flex h-9 items-center gap-1.5 hairline px-3 text-xs anon-fg disabled:opacity-50 hover:bg-[var(--anon-raise)]"
                title="Template match — instant"
              >
                <Zap className="h-3.5 w-3.5 anon-accent" /> template
              </button>
              <button
                onClick={() => s.generateWithLLM()}
                disabled={!s.generativePrompt.trim() || s.generating}
                className="anon-mono inline-flex h-9 items-center gap-1.5 bg-[var(--anon-accent)] px-4 text-xs text-[var(--anon-accent-fg)] disabled:opacity-50 hover:brightness-110"
                title="Generate on the server — real LLM when Workers AI is bound, template otherwise"
              >
                {s.generating ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> generating…</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" /> generate</>
                )}
              </button>
            </div>
            {/* preset chips */}
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    s.setGenerativePrompt(p);
                    setTimeout(() => s.generateUi(), 0);
                  }}
                  className="anon-mono hairline px-2 py-1 text-[10px] anon-mut hover:bg-[var(--anon-raise)] hover:anon-fg"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* generated list */}
          <div className="anon-scroll flex-1 overflow-y-auto p-3">
            {s.generatedUis.length === 0 && !s.generating && (
              <div className="flex h-full flex-col items-center justify-center gap-2 anon-mut">
                <Sparkles className="h-8 w-8 anon-dim" />
                <p className="anon-mono text-xs">no generations yet</p>
                <p className="anon-mono text-[10px] anon-dim text-center max-w-sm">
                  type a prompt above or pick a preset. <span className="anon-accent">template</span> = instant keyword match (login/dashboard/form/card/nav). <span className="anon-accent">generate</span> = real LLM via Cloudflare Workers AI (needs the AI binding; honestly falls back to a labeled template).
                </p>
              </div>
            )}
            {s.generating && (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin anon-accent" />
                <p className="anon-mono text-xs anon-mut">generating your UI…</p>
                <p className="anon-mono text-[10px] anon-dim">typically 3-8 seconds</p>
              </div>
            )}
            {s.generatedUis.map((gen) => (
              <div key={gen.id} className="mb-4 hairline bg-[var(--anon-bg)]">
                <div className="flex h-8 items-center gap-2 hairline-b px-3">
                  <span className="anon-mono text-[10px] anon-accent inline-flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5" /> prompt
                  </span>
                  <span className="anon-mono truncate text-[11px] anon-fg">{gen.prompt}</span>
                  <span
                    className="anon-mono ml-auto text-[9px] px-1.5 py-0.5"
                    style={{
                      color: gen.source === "ai" ? "var(--anon-accent)" : "var(--anon-mut)",
                      border: "1px solid var(--anon-line)",
                    }}
                  >
                    {gen.source === "ai" ? "AI" : "template"}{gen.model ? ` · ${gen.model}` : ""}
                  </span>
                  <span className="anon-mono text-[9px] anon-dim">
                    {new Date(gen.ts).toLocaleTimeString()}
                  </span>
                </div>
                {/* preview iframe */}
                <div className="hairline-b" style={{ height: 240 }}>
                  <iframe
                    srcDoc={gen.html}
                    title={`preview-${gen.id}`}
                    className="h-full w-full"
                    sandbox="allow-scripts"
                  />
                </div>
                {/* actions */}
                <div className="flex items-center gap-1.5 p-2">
                  <button
                    onClick={() => s.insertGeneratedUi(gen.id)}
                    className="anon-mono inline-flex items-center gap-1 bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] px-2.5 py-1 text-[10px] hover:brightness-110"
                  >
                    <FilePlus2 className="h-3 w-3" /> insert as file
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(gen.html);
                      toast.success("HTML copied to clipboard");
                    }}
                    className="anon-mono inline-flex items-center gap-1 hairline px-2.5 py-1 text-[10px] anon-mut hover:bg-[var(--anon-raise)] hover:anon-fg"
                  >
                    <Copy className="h-3 w-3" /> copy html
                  </button>
                  <a
                    href={`data:text/html;charset=utf-8,${encodeURIComponent(gen.html)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="anon-mono inline-flex items-center gap-1 hairline px-2.5 py-1 text-[10px] anon-mut hover:bg-[var(--anon-raise)] hover:anon-fg"
                  >
                    <ExternalLink className="h-3 w-3" /> open in tab
                  </a>
                </div>
              </div>
            ))}
          </div>

          <div className="hairline-t px-3 py-1.5 anon-mono text-[10px] anon-dim flex items-center justify-between">
            <span>templates themed to match anonshare · AI via Cloudflare Workers AI binding</span>
            <span>{s.generatedUis.length} generated</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
