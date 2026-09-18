"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Target, X, Clock } from "lucide-react";
import { useAnon } from "@/lib/store";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + "m ago";
  return Math.floor(diff / 3_600_000) + "h ago";
}

export function GoalBanner() {
  const s = useAnon();
  if (!s.goalText || !s.goalSetAt) return null;

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
            <div className="anon-sans truncate text-sm anon-fg">{s.goalText}</div>
          </div>
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
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
