"use client";

import { useEffect, useRef } from "react";
import {
  Terminal as TerminalIcon,
  Trash2,
  Play,
  Loader2,
  ChevronUp,
  ChevronDown,
  CornerDownLeft,
} from "lucide-react";
import { useAnon } from "@/lib/store";

/**
 * Per-language stdin hints — shown under the INPUT box so users immediately
 * know HOW their values are consumed. This is the #1 confusion with online
 * compilers ("how do I type values?"), so the hint matches the active file's
 * language and names the exact call.
 */
const LANG_INPUT_HINTS: Record<string, string> = {
  python: "input() reads one line · int(input()) for numbers",
  c: 'scanf("%d", &x) · separate values with spaces or newlines',
  cpp: "cin >> x · one value per line works too",
  java: "Scanner(System.in) · nextInt() reads one per line",
  javascript: "readline / process.stdin · one line each",
  bash: "read VAR · one line each",
  go: "fmt.Scan(&x) · space or newline separated",
  rust: "stdin().read_line(&mut s) · one line each",
};

export function TerminalDrawer() {
  const s = useAnon();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const activeFile = s.files.find((f) => f.id === s.activeFileId);
  const lang = (activeFile?.language || "python").toLowerCase();
  const inputHint = LANG_INPUT_HINTS[lang] ?? "one line per read";
  const stdinLines = s.stdin.trim() ? s.stdin.split("\n").length : 0;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [s.terminalLines.length, s.running]);

  /* ---- drag-to-resize (desktop pointer only) ---- */
  function onDragStart(e: React.PointerEvent) {
    dragRef.current = { startY: e.clientY, startH: s.terminalHeight };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onDragMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    const max = Math.min(600, Math.round(window.innerHeight * 0.7));
    const h = Math.max(140, Math.min(max, dragRef.current.startH + dy));
    if (h !== s.terminalHeight) s.setTerminalHeight(h);
  }
  function onDragEnd(e: React.PointerEvent) {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* released already */
    }
  }

  if (!s.terminalOpen) return null;

  return (
    <div
      className="flex flex-none flex-col hairline-t bg-[var(--anon-raise)]"
      style={{ height: s.terminalHeight }}
    >
      {/* resize handle (desktop only — touch drag conflicts with scrolling) */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className="term-drag hidden h-1.5 w-full cursor-row-resize hover:bg-[var(--anon-accent)] md:block"
        title="Drag to resize terminal"
        aria-hidden
      />

      {/* header */}
      <div className="flex h-8 items-center gap-2 hairline-b px-3">
        <TerminalIcon className="h-3.5 w-3.5 anon-accent" />
        <span className="anon-mono text-xs anon-fg">terminal</span>

        {/* stdin status chip — shows the program's input readiness at a glance */}
        <button
          onClick={() => s.setStdinOpen(!s.stdinOpen)}
          className={`anon-mono inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] transition-colors ${
            stdinLines > 0
              ? "anon-accent bg-[var(--anon-panel)]"
              : "anon-mut hover:anon-fg"
          }`}
          title="Toggle the input (stdin) box"
        >
          <CornerDownLeft className="h-3 w-3" />
          input {stdinLines > 0 ? `· ${stdinLines} line${stdinLines === 1 ? "" : "s"}` : "· empty"}
        </button>

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

      {/* output pane */}
      <div
        ref={scrollRef}
        className="anon-scroll flex-1 overflow-y-auto px-3 py-2 anon-mono text-[12px] leading-snug"
      >
        {s.terminalLines.length === 0 && (
          <div className="anon-mut leading-relaxed">
            <div>
              <span className="anon-accent">$</span> press <kbd className="hairline px-1 anon-fg">⌘↵</kbd> or{" "}
              <button onClick={() => s.runCode()} className="anon-accent underline">
                Run
              </button>{" "}
              to execute the active file.
            </div>
            <div className="mt-1 text-[10px] anon-dim">
              programs that read input (<code>input()</code>, <code>scanf</code>, <code>cin</code>…) take their
              values from the <span className="anon-accent">input</span> box below.
            </div>
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
                      : line.kind === "hint"
                        ? "whitespace-pre-wrap leading-relaxed"
                        : "anon-dim italic whitespace-pre-wrap"
            }
            style={
              line.kind === "stderr" || line.kind === "error"
                ? { color: "var(--anon-danger)" }
                : line.kind === "hint"
                  ? { color: "var(--anon-warn)" }
                  : line.kind === "meta" && line.exit != null
                    ? { color: line.exit === 0 ? "var(--anon-ok)" : "var(--anon-danger)" }
                    : line.kind === "meta"
                      ? { color: "var(--anon-mut)" }
                      : undefined
            }
          >
            {line.kind === "hint" && <span className="anon-mut">hint · </span>}
            {line.text || "\u00A0"}
          </div>
        ))}
        {s.running && (
          <div className="anon-accent inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> running…
          </div>
        )}
      </div>

      {/* input (stdin) pane — always present, collapsible.
          Programs read these values: one line per input()/scanf()/cin call. */}
      <div className="hairline-t flex flex-col">
        <div className="flex h-7 items-center gap-2 px-3">
          <span className="anon-mono text-[10px] uppercase tracking-wider anon-dim">
            input → stdin
          </span>
          <span className="anon-mono text-[9px] anon-mut">
            {stdinLines > 0 ? "ready" : "optional"}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => s.runCode()}
              disabled={s.running}
              className="anon-mono inline-flex h-5 items-center gap-1 bg-[var(--anon-accent)] px-2 text-[10px] font-medium text-[var(--anon-accent-fg)] transition-transform hover:brightness-110 active:translate-y-px disabled:opacity-60"
              title="Run with this input · ⌘↵"
            >
              <Play className="h-2.5 w-2.5" /> run
            </button>
            <button
              onClick={() => s.setStdinOpen(!s.stdinOpen)}
              className="anon-mut hover:anon-fg"
              title={s.stdinOpen ? "Hide input box" : "Show input box"}
              aria-label={s.stdinOpen ? "Hide input box" : "Show input box"}
            >
              {s.stdinOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {s.stdinOpen && (
          <>
            <textarea
              ref={inputRef}
              value={s.stdin}
              onChange={(e) => s.setStdin(e.target.value)}
              placeholder={"3\n4\n7"}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              aria-label="Program input (stdin)"
              className="anon-mono anon-scroll ed-font h-16 resize-none bg-[var(--anon-bg)] hairline-b text-[length:var(--anon-edfont)] leading-snug px-2 py-1.5 outline-none focus:border-[var(--anon-accent)] mx-0"
            />
            <div className="anon-mono px-3 py-1 text-[10px] anon-mut">
              {inputHint}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
