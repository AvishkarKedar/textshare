"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  FlaskConical,
  Check,
  X as XIcon,
  ChevronRight,
  Loader2,
  Play,
  Trash2,
  CircleDot,
  AlertCircle,
} from "lucide-react";
import { useAnon } from "@/lib/store";

export function TestRunnerPanel() {
  const s = useAnon();
  if (!s.testPanelOpen) return null;
  const r = s.testResult;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="flex h-72 flex-none flex-col hairline-l bg-[var(--anon-panel)] sm:w-80 lg:w-96"
      >
        {/* header */}
        <div className="flex h-9 items-center justify-between hairline-b px-3">
          <div className="anon-mono inline-flex items-center gap-1.5 text-xs">
            <FlaskConical className="h-3.5 w-3.5 anon-accent" /> test runner
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => s.runTests()}
              disabled={s.testing}
              className="anon-mono inline-flex items-center gap-1 bg-[var(--anon-accent)] px-2 py-1 text-[10px] text-[var(--anon-accent-fg)] disabled:opacity-60"
            >
              {s.testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              {s.testing ? "running" : "run"}
            </button>
            <button
              onClick={() => s.clearTests()}
              className="anon-mut hover:anon-fg"
              aria-label="Clear"
              title="Clear results"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => s.toggleTestPanel()}
              className="anon-mut hover:anon-fg"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* summary */}
        {r ? (
          <div className="hairline-b px-3 py-2">
            <div className="anon-mono flex items-center gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1" style={{ color: "var(--anon-ok)" }}>
                <Check className="h-3 w-3" /> {r.passed} passed
              </span>
              <span className="inline-flex items-center gap-1" style={{ color: "var(--anon-danger)" }}>
                <XIcon className="h-3 w-3" /> {r.failed} failed
              </span>
              <span className="inline-flex items-center gap-1 anon-mut">
                <CircleDot className="h-3 w-3" /> {r.skipped} skipped
              </span>
              <span className="anon-dim ml-auto">{r.durationMs}ms</span>
            </div>
            {/* progress bar */}
            <div className="mt-2 h-1.5 w-full bg-[var(--anon-line)]">
              <div
                className="h-full"
                style={{
                  width: `${(r.passed / Math.max(1, r.total)) * 100}%`,
                  background: "var(--anon-ok)",
                }}
              />
            </div>
          </div>
        ) : s.testing ? (
          <div className="hairline-b px-3 py-2 anon-mono text-[11px] anon-mut inline-flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin anon-accent" /> parsing test() / describe() patterns…
          </div>
        ) : (
          <div className="hairline-b px-3 py-2 anon-mono text-[11px] anon-mut">
            press <span className="anon-accent">⌘⇧T</span> or type <span className="anon-accent">/test</span> to run
          </div>
        )}

        {/* suite tree */}
        <div className="anon-scroll flex-1 overflow-y-auto p-2">
          {!r && !s.testing && (
            <div className="anon-mono px-2 py-8 text-center text-[11px] anon-dim">
              no tests yet — open a file with describe()/test() blocks
            </div>
          )}
          {r?.suites.map((suite) => {
            const expanded = s.testExpanded[suite.id] !== false;
            const passN = suite.cases.filter((c) => c.status === "pass").length;
            const failN = suite.cases.filter((c) => c.status === "fail").length;
            return (
              <div key={suite.id} className="mb-1.5">
                <button
                  onClick={() => s.toggleTestExpanded(suite.id)}
                  className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-[var(--anon-raise)]"
                >
                  <ChevronRight
                    className={`h-3 w-3 flex-none anon-mut transition-transform ${expanded ? "rotate-90" : ""}`}
                  />
                  <span className="anon-mono text-[11px] anon-fg">{suite.name}</span>
                  {failN > 0 ? (
                    <span className="anon-mono text-[10px]" style={{ color: "var(--anon-danger)" }}>
                      {failN} fail
                    </span>
                  ) : (
                    <span className="anon-mono text-[10px]" style={{ color: "var(--anon-ok)" }}>
                      {passN} ok
                    </span>
                  )}
                </button>
                {expanded && (
                  <div className="ml-4 hairline-l" style={{ borderColor: "var(--anon-line2)" }}>
                    {suite.cases.map((tc) => (
                      <div key={tc.id} className="px-2 py-1">
                        <div className="flex items-center gap-2">
                          {tc.status === "pass" ? (
                            <Check className="h-3 w-3 flex-none" style={{ color: "var(--anon-ok)" }} />
                          ) : tc.status === "fail" ? (
                            <XIcon className="h-3 w-3 flex-none" style={{ color: "var(--anon-danger)" }} />
                          ) : tc.status === "pending" ? (
                            <Loader2 className="h-3 w-3 animate-spin flex-none anon-accent" />
                          ) : (
                            <CircleDot className="h-3 w-3 flex-none anon-mut" />
                          )}
                          <span className="anon-mono truncate text-[10px] anon-fg">{tc.name}</span>
                          <span className="anon-mono ml-auto text-[9px] anon-dim">{tc.durationMs}ms</span>
                        </div>
                        {tc.error && (
                          <div className="mt-1 flex items-start gap-1.5 pl-5">
                            <AlertCircle className="h-2.5 w-2.5 flex-none mt-0.5" style={{ color: "var(--anon-warn)" }} />
                            <code className="anon-mono break-all text-[9px]" style={{ color: "var(--anon-danger)" }}>
                              {tc.error}
                            </code>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* footer */}
        <div className="hairline-t px-3 py-1.5 anon-mono text-[9px] anon-dim flex items-center justify-between">
          <span>js / py test patterns</span>
          <span>{r ? `${r.passed + r.failed}/${r.total} ran` : "0 tests"}</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
