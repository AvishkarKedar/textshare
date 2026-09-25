"use client";

import { useEffect, useRef, useState } from "react";
import { tokenizeLine, TOKEN_COLORS } from "@/lib/highlight";

/**
 * Hero demo card — a small, self-contained simulation of a live room:
 * three peers typing a short program together, one line each, with the
 * same syntax tokenizer the real editor uses.
 *
 * Everything is deterministic and CSS-driven except the character cadence,
 * which uses a fixed rhythm with tiny pauses after punctuation so it reads
 * as human typing without jitter.
 */

interface Line {
  text: string;
  author: "you" | "av" | "mz";
}

const SCRIPT: Line[] = [
  { text: "// three strangers, one room, zero servers", author: "mz" },
  { text: "const room = await anonshare.join('XK42QM')", author: "you" },
  { text: "", author: "you" },
  { text: "const seal = (msg) => room.encrypt(msg)", author: "av" },
  { text: "// the relay only ever sees this:", author: "mz" },
  { text: "// a2f9…c41b  (AES-GCM, 256-bit)", author: "mz" },
  { text: "", author: "av" },
  { text: "room.on('peer', (p) => p.send(seal('hi ' + p.name)))", author: "av" },
  { text: "// erased for everyone when the last tab closes", author: "you" },
];

const AUTHORS = {
  you: { name: "you", color: "#4c8dff" },
  av: { name: "ava", color: "#3ddc84" },
  mz: { name: "moe", color: "#c792ea" },
} as const;

/** Base cadence + human pause after sentence-ish punctuation. */
const BASE_MS = 26;
function charDelay(ch: string, next: string | undefined): number {
  if (ch === "" ) return BASE_MS;
  if (".,:;".includes(ch)) return 170;
  if (ch === "(" || ch === "{") return 90;
  if (ch === " ") return 46;
  if (next === undefined) return 220; // end of line — beat before newline
  if ("w".includes(ch) && Math.random() < 0.06) return 140; // rare think-pause
  return BASE_MS + Math.random() * 14;
}

export function DemoCard() {
  const [typedLines, setTypedLines] = useState<string[]>(SCRIPT.map(() => ""));
  const [current, setCurrent] = useState(0);
  const [phase, setPhase] = useState<"typing" | "hold" | "fade">("typing");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let line = 0;
    let char = 0;
    let mode: "typing" | "hold" | "fade" = "typing";
    // local mirror so setTimeout closures never read stale state
    let mirror: string[] = SCRIPT.map(() => "");

    function step() {
      if (cancelled) return;

      if (mode === "fade") {
        // card content faded out silently — start over
        mode = "typing";
        line = 0;
        char = 0;
        mirror = SCRIPT.map(() => "");
        setPhase("typing");
        setCurrent(0);
        setTypedLines(mirror);
        setTimeout(step, 420);
        return;
      }

      if (mode === "hold") {
        mode = "fade";
        setPhase("fade");
        setTimeout(step, 700);
        return;
      }

      if (line >= SCRIPT.length) {
        mode = "hold";
        setPhase("hold");
        setTimeout(step, 5200);
        return;
      }

      const target = SCRIPT[line].text;

      if (char >= target.length) {
        line += 1;
        char = 0;
        setCurrent(line);
        setTimeout(step, 240);
        return;
      }

      const ch = target[char];
      const delay = charDelay(ch, target[char + 1]);
      setTimeout(() => {
        if (cancelled) return;
        mirror = [...mirror];
        mirror[line] = target.slice(0, char + 1);
        setTypedLines(mirror);
        char += 1;
        step();
      }, delay);
    }

    step();
    return () => { cancelled = true; };
  }, []);

  // keep the current line in view — smooth, never jumpy
  useEffect(() => {
    if (scrollRef.current) {
      const lh = 21.6; // 13.5px * 1.6 line-height
      scrollRef.current.scrollTo({ top: Math.max(0, current * lh - 64), behavior: "smooth" });
    }
  }, [current]);

  const activeAuthor = SCRIPT[Math.min(current, SCRIPT.length - 1)]?.author ?? "you";
  const author = AUTHORS[activeAuthor];
  const typing = phase === "typing" && current < SCRIPT.length;

  return (
    <div className="hairline anon-panel shadow-2xl shadow-black/40">
      {/* window chrome — file + live presence */}
      <div className="anon-mono anon-mut flex h-10 items-center gap-2.5 px-3.5 hairline-b">
        <span className="anon-accent">{'>'}</span>
        <span className="anon-fg text-xs">room.js</span>
        <span className="anon-dim">·</span>
        <span className="text-[10px]">XK42QM</span>

        <div className="ml-auto flex items-center gap-1.5">
          {(["you", "av", "mz"] as const).map((k) => {
            const a = AUTHORS[k];
            const isActive = activeAuthor === k && typing;
            return (
              <span
                key={k}
                title={isActive ? `${a.name} is typing…` : a.name}
                className="relative inline-flex h-5 w-5 items-center justify-center text-[9px] font-semibold text-black transition-all duration-300"
                style={{
                  background: a.color,
                  opacity: isActive ? 1 : 0.55,
                  transform: isActive ? "scale(1.12)" : "scale(0.94)",
                  zIndex: isActive ? 5 : 1,
                }}
              >
                {a.name.slice(0, 1).toUpperCase() + a.name.slice(1, 2)}
              </span>
            );
          })}
          <span className="anim-beat ml-1.5 h-1.5 w-1.5 rounded-full" style={{ background: "var(--anon-ok)" }} aria-label="live" />
        </div>
      </div>

      {/* typing surface */}
      <div
        ref={scrollRef}
        className="anon-scroll relative h-[300px] overflow-y-auto bg-[var(--anon-raise)] px-4 py-3.5 anon-mono text-[13.5px] leading-[1.6] sm:h-[320px]"
        style={{ scrollbarWidth: "none" }}
        aria-hidden
      >
        <div className={phase === "fade" ? "transition-opacity duration-500 opacity-0" : "transition-opacity duration-300 opacity-100"}>
          {SCRIPT.map((line, i) => {
            const isCurrent = i === current && typing;
            const typed = typedLines[i] ?? "";
            const lineAuthor = AUTHORS[line.author];
            return (
              <div
                key={i}
                className="relative flex min-h-[1.6em]"
                style={
                  isCurrent
                    ? { boxShadow: `inset 2px 0 0 0 ${lineAuthor.color}` }
                    : undefined
                }
              >
                <span className="anon-dim mr-4 w-6 flex-none select-none text-right tabular-nums">
                  {i + 1}
                </span>
                <span className="anon-fg whitespace-pre-wrap break-all">
                  <Tokens line={typed} />
                  {isCurrent && (
                    <span
                      className="anim-blink inline-block h-[1.05em] w-[2px] align-middle"
                      style={{ background: lineAuthor.color }}
                    />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* footer — what the room would show */}
      <div className="anon-mut anon-mono flex h-8 items-center gap-2 px-3.5 text-[10px] hairline-t">
        {typing ? (
          <>
            <span className="anim-beat h-1.5 w-1.5 rounded-full" style={{ background: author.color }} />
            <span>
              <span style={{ color: author.color }}>{author.name}</span> is typing…
            </span>
          </>
        ) : (
          <>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--anon-ok)" }} />
            <span>synced · 3 peers · e2ee</span>
          </>
        )}
        <span className="anon-dim ml-auto hidden sm:inline">no account · erased on exit</span>
      </div>
    </div>
  );
}

/** Render one line through the real editor tokenizer. */
function Tokens({ line }: { line: string }) {
  if (!line) return null;
  const tokens = tokenizeLine(line, "javascript");
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} style={{ color: TOKEN_COLORS[t.type] }}>
          {t.value}
        </span>
      ))}
    </>
  );
}
