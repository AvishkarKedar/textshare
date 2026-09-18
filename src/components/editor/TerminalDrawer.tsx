"use client";

import { useEffect, useRef } from "react";
import { X, Terminal as TerminalIcon, Trash2, Play, Loader2, ChevronUp, ChevronDown, Keyboard } from "lucide-react";
import { useAnon } from "@/lib/store";

export function TerminalDrawer() {
  const s = useAnon();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [s.terminalLines.length]);

  if (!s.terminalOpen) return null;

  return (
    <div className="flex h-56 flex-none flex-col hairline-t bg-[var(--anon-raise)]">
      {/* header */}
      <div className="flex h-8 items-center gap-2 hairline-b px-3">
        <TerminalIcon className="h-3.5 w-3.5 anon-accent" />
        <span className="anon-mono text-xs anon-fg">terminal</span>
        <div className="ml-2 flex items-center gap-0.5">
          <button
            onClick={() => s.setTerminalTab("output")}
            className={`anon-mono px-2 py-0.5 text-[10px] ${s.terminalTab === "output" ? "bg-[var(--anon-panel)] anon-fg" : "anon-mut hover:anon-fg"}`}
          >
            output
          </button>
          <button
            onClick={() => s.setTerminalTab("stdin")}
            className={`anon-mono px-2 py-0.5 text-[10px] ${s.terminalTab === "stdin" ? "bg-[var(--anon-panel)] anon-fg" : "anon-mut hover:anon-fg"}`}
          >
            stdin
          </button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => s.clearTerminal()}
            className="anon-mono inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] anon-mut hover:anon-fg"
            title="Clear terminal"
          >
            <Trash2 className="h-3 w-3" /> clear
          </button>
          <button
            onClick={() => s.toggleTerminal()}
            className="anon-mut hover:anon-fg"
            title="Collapse (⌘\\)"
            aria-label="Collapse terminal"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {s.terminalTab === "output" ? (
        <div ref={scrollRef} className="anon-scroll flex-1 overflow-y-auto px-3 py-2 anon-mono text-[12px] leading-snug">
          {s.terminalLines.length === 0 && (
            <div className="anon-mut">
              <span className="anon-accent">$</span> press <kbd className="hairline px-1 anon-fg">⌘↵</kbd> or{" "}
              <button onClick={() => s.runCode()} className="anon-accent underline">
                Run
              </button>{" "}
              to execute the active file.
            </div>
          )}
          {s.terminalLines.map((line) => (
            <div
              key={line.id}
              className={
                line.kind === "stdout"
                  ? "anon-fg whitespace-pre-wrap"
                  : line.kind === "stderr"
                    ? "whitespace-pre-wrap"
                    : line.kind === "error"
                      ? "whitespace-pre-wrap"
                      : line.kind === "stdin"
                        ? "anon-accent whitespace-pre-wrap"
                        : "anon-dim italic"
              }
              style={
                line.kind === "stderr" || line.kind === "error"
                  ? { color: "var(--anon-danger)" }
                  : line.kind === "meta"
                    ? { color: "var(--anon-mut)" }
                    : undefined
              }
            >
              {line.text || "\u00A0"}
            </div>
          ))}
          {s.running && (
            <div className="anon-accent inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> running…
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col p-3 gap-2">
          <label className="anon-mono text-[10px] uppercase tracking-wider anon-dim">
            stdin — piped to your program&apos;s input()
          </label>
          <textarea
            value={s.stdin}
            onChange={(e) => s.setStdin(e.target.value)}
            placeholder={"hello\nworld"}
            spellCheck={false}
            className="anon-mono anon-scroll flex-1 resize-none bg-[var(--anon-bg)] hairline px-2 py-1.5 text-[12px] outline-none focus:border-[var(--anon-accent)]"
          />
          <div className="anon-mono text-[10px] anon-dim">
            one line per <code className="anon-fg">readline()</code> / <code className="anon-fg">input()</code> call
          </div>
        </div>
      )}
    </div>
  );
}
