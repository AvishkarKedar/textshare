"use client";

import { useEffect, useRef, useState } from "react";

interface DemoLine {
  text: string;
  typed: string;
  author: "me" | "av" | "lz";
}

const FULL_SCRIPT: { text: string; author: "me" | "av" | "lz" }[] = [
  { text: "function shareRoom(code, opts = {}) {", author: "me" },
  { text: "  const key  = deriveKey(code, opts.password)", author: "av" },
  { text: "  const auth = deriveAuth(code, opts.password)", author: "av" },
  { text: "  // relay sees SHA-256(auth) only", author: "lz" },
  { text: "  return connect(`wss://relay.avishkark.in/room/${code}`, { key, auth })", author: "me" },
  { text: "}", author: "me" },
  { text: "", author: "me" },
  { text: 'const room = shareRoom("ABC123", { ttl: "1h" })', author: "lz" },
  { text: 'room.on("peer", (p) => console.log(p.name + " joined"))', author: "lz" },
];

const AUTHORS = {
  me: { name: "ME", color: "#4c8dff" },
  av: { name: "AV", color: "#3ddc84" },
  lz: { name: "LZ", color: "#c792ea" },
};

export function DemoCard() {
  const [lines, setLines] = useState<DemoLine[]>(
    FULL_SCRIPT.map((l) => ({ ...l, typed: "" })),
  );
  const [currentLine, setCurrentLine] = useState(0);
  const [currentChar, setCurrentChar] = useState(0);
  const [phase, setPhase] = useState<"typing" | "pause" | "restart">("typing");
  const scrollRef = useRef<HTMLDivElement>(null);

  // typing animation — single setTimeout chain, no synchronous setState
  useEffect(() => {
    let cancelled = false;
    let lineIdx = 0;
    let charIdx = 0;
    let phase: "typing" | "pause" | "restart" = "typing";

    function typeNext() {
      if (cancelled) return;

      if (phase === "restart") {
        phase = "typing";
        lineIdx = 0;
        charIdx = 0;
        setLines(FULL_SCRIPT.map((l) => ({ ...l, typed: "" })));
        setCurrentLine(0);
        setCurrentChar(0);
        setTimeout(typeNext, 100);
        return;
      }

      if (phase === "pause") {
        phase = "restart";
        setPhase("restart");
        setTimeout(typeNext, 4000);
        return;
      }

      // typing phase
      if (lineIdx >= FULL_SCRIPT.length) {
        phase = "pause";
        setPhase("pause");
        setTimeout(typeNext, 1500);
        return;
      }

      const target = FULL_SCRIPT[lineIdx].text;

      if (charIdx >= target.length) {
        // move to next line
        lineIdx++;
        charIdx = 0;
        setCurrentLine(lineIdx);
        setCurrentChar(0);
        setTimeout(typeNext, 180 + Math.random() * 120);
        return;
      }

      // type next char
      const delay = target[charIdx] === " " ? 20 : 28 + Math.random() * 35;
      setTimeout(() => {
        if (cancelled) return;
        const newTyped = target.slice(0, charIdx + 1);
        setLines((prev) => {
          const next = [...prev];
          next[lineIdx] = { ...next[lineIdx], typed: newTyped };
          return next;
        });
        setCurrentChar(charIdx + 1);
        charIdx++;
        typeNext();
      }, delay);
    }

    typeNext();
    return () => { cancelled = true; };
  }, []);

  // auto-scroll to keep current line visible
  useEffect(() => {
    if (scrollRef.current) {
      const lineHeight = 13 * 1.6;
      const target = currentLine * lineHeight - 60;
      scrollRef.current.scrollTop = Math.max(0, target);
    }
  }, [currentLine]);

  const activeAuthor = FULL_SCRIPT[currentLine]?.author ?? "me";
  const authorInfo = AUTHORS[activeAuthor];

  return (
    <div className="hairline anon-panel shadow-2xl shadow-black/40">
      {/* demo top bar */}
      <div className="flex h-9 items-center gap-2 hairline-b px-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5c4d" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#e8b339" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#3ddc84" }} />
        <span className="anon-mono ml-3 text-xs anon-mut">DEMO01 · shareRoom.js</span>
        <div className="ml-auto flex items-center gap-1.5">
          {(["me", "av", "lz"] as const).map((k) => {
            const a = AUTHORS[k];
            const isActive = activeAuthor === k && phase === "typing";
            return (
              <span
                key={k}
                className="anon-mono relative inline-flex h-5 w-5 items-center justify-center text-[10px] font-semibold text-black transition-all"
                style={{
                  background: a.color,
                  transform: isActive ? "scale(1.15)" : "scale(1)",
                  zIndex: isActive ? 5 : 1,
                }}
              >
                {a.name}
                {isActive && (
                  <span
                    className="absolute -inset-0.5 rounded-sm"
                    style={{
                      border: `1.5px solid ${a.color}`,
                      opacity: 0.6,
                    }}
                  />
                )}
              </span>
            );
          })}
        </div>
      </div>

      {/* code area */}
      <div
        ref={scrollRef}
        className="anon-scroll relative h-[320px] overflow-y-auto px-4 py-3 anon-mono text-[13px] leading-[1.6] anon-raise"
        style={{ scrollbarWidth: "none" }}
      >
        {lines.map((line, i) => {
          const isCurrent = i === currentLine && phase === "typing";
          const isPast = i < currentLine || (i === currentLine && phase !== "typing");
          const lineAuthor = AUTHORS[line.author] ?? AUTHORS.me;
          return (
            <div
              key={i}
              className="flex relative"
              style={{ minHeight: "1.6em" }}
            >
              {/* line number */}
              <span
                className="anon-dim mr-4 w-6 flex-none select-none text-right"
                style={{ color: isCurrent ? lineAuthor.color : undefined }}
              >
                {i + 1}
              </span>
              {/* author indicator on left */}
              {isCurrent && (
                <span
                  className="anon-mono absolute left-10 -ml-1 -mt-0.5 px-1 text-[8px] font-bold text-black anim-flagfade"
                  style={{ background: lineAuthor.color, top: "-12px" }}
                >
                  {lineAuthor.name}
                </span>
              )}
              {/* code */}
              <span className="anon-fg whitespace-pre-wrap break-all">
                {renderLine(line.typed)}
                {isCurrent && (
                  <span
                    className="inline-block w-[2px] h-[1.1em] align-middle anim-blink"
                    style={{ background: lineAuthor.color }}
                  />
                )}
              </span>
            </div>
          );
        })}
        {phase === "restart" && (
          <div className="mt-3 anon-mono text-[11px] anon-dim flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full anim-beat" style={{ background: "var(--anon-ok)" }} />
            restarting demo…
          </div>
        )}
      </div>

      {/* demo footer */}
      <div className="hairline-t flex h-7 items-center gap-2 px-3">
        <span className="h-1.5 w-1.5 rounded-full anim-beat" style={{ background: "var(--anon-ok)" }} />
        <span className="anon-mono text-[10px] anon-mut">
          {phase === "typing" ? `${authorInfo.name} typing…` : "live"} · 3 online · e2e
        </span>
        <span className="anon-mono ml-auto text-[10px] anon-dim">⌘K to try it</span>
      </div>
    </div>
  );
}

function renderLine(line: string) {
  if (!line) return null;
  const tokens: React.ReactNode[] = [];
  let key = 0;

  // comments
  const commentIdx = line.indexOf("//");
  let code = line;
  let comment = "";
  if (commentIdx >= 0) {
    code = line.slice(0, commentIdx);
    comment = line.slice(commentIdx);
  }

  // tokenize: strings, keywords, numbers
  const combined =
    /(["`])(?:\\.|(?!\1).)*\1|\b(?:function|const|return|on|if|else|new|console|log)\b|\b\d+\b/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = combined.exec(code))) {
    if (m.index > last) {
      tokens.push(<span key={key++}>{code.slice(last, m.index)}</span>);
    }
    const tok = m[0];
    if (tok.startsWith('"') || tok.startsWith("`")) {
      tokens.push(
        <span key={key++} style={{ color: "var(--anon-ok)" }}>{tok}</span>,
      );
    } else if (/^\d+$/.test(tok)) {
      tokens.push(
        <span key={key++} style={{ color: "var(--anon-warn)" }}>{tok}</span>,
      );
    } else {
      tokens.push(
        <span key={key++} style={{ color: "var(--anon-accent)" }}>{tok}</span>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < code.length) {
    tokens.push(<span key={key++}>{code.slice(last)}</span>);
  }
  if (comment) {
    tokens.push(
      <span key={key++} style={{ color: "var(--anon-dim)" }}>{comment}</span>,
    );
  }
  return tokens;
}
