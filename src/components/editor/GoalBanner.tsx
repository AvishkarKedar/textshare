"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, X, Clock, Check } from "lucide-react";
import { toast } from "sonner";
import { useAnon } from "@/lib/store";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + "m ago";
  return Math.floor(diff / 3_600_000) + "h ago";
}

export function GoalBanner() {
  const s = useAnon();
  // inline edit mode (click the banner or type /goal) — a small form with
  // save/cancel replaces the blocking window.prompt of the /goal flow.
  // null = not editing; otherwise the current draft.
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = draft !== null;

  if (!s.goalText || !s.goalSetAt) return null;

  function startEdit() {
    setDraft(s.goalText);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  function saveEdit() {
    const text = (draft ?? "").trim();
    setDraft(null);
    if (!text || text === s.goalText) return;
    s.setGoal(text);
    toast.success("Goal updated", { description: text });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
        className="flex-none overflow-hidden hairline-b anon-raise"
      >
        <div className="flex items-center gap-2.5 px-3 py-2">
          <span
            className="inline-flex h-6 w-6 flex-none items-center justify-center"
            style={{ background: s.goalColor || "var(--anon-accent)" }}
          >
            <Target className="h-3.5 w-3.5 text-black" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="anon-mono text-[10px] uppercase tracking-wider anon-dim">
              session goal · {s.goalAuthor}
            </div>
            {editing ? (
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={draft ?? ""}
                  maxLength={200}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveEdit();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setDraft(null);
                    }
                  }}
                  placeholder="what are we shipping?"
                  aria-label="Edit session goal"
                  className="anon-mono h-8 min-w-0 flex-1 bg-[var(--anon-bg)] hairline px-2.5 text-sm anon-fg outline-none focus:border-[var(--anon-accent)]"
                />
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={!(draft ?? "").trim()}
                  className="anon-mono inline-flex h-8 flex-none items-center gap-1 bg-[var(--anon-accent)] px-2.5 text-[11px] text-[var(--anon-accent-fg)] transition-transform hover:brightness-110 active:translate-y-px disabled:opacity-50"
                  aria-label="Save goal"
                >
                  <Check className="h-3.5 w-3.5" /> save
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="anon-mono inline-flex h-8 flex-none items-center gap-1 hairline px-2.5 text-[11px] anon-mut hover:anon-fg"
                  aria-label="Cancel goal edit"
                >
                  <X className="h-3.5 w-3.5" /> cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startEdit}
                className="block w-full truncate text-left"
                title="Click to edit the goal"
              >
                <span className="anon-sans truncate text-sm anon-fg underline decoration-transparent underline-offset-2 hover:decoration-[var(--anon-line)]">
                  {s.goalText}
                </span>
              </button>
            )}
          </div>
          {!editing && (
            <>
              <div className="anon-mono flex items-center gap-1 text-[10px] anon-dim flex-none">
                <Clock className="h-2.5 w-2.5" />
                {relativeTime(s.goalSetAt)}
              </div>
              <button
                onClick={() => s.clearGoal()}
                className="anon-mut hover:anon-fg flex-none"
                title="Clear goal"
                aria-label="Clear goal"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
