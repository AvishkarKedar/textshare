"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Search,
  Replace,
  ChevronUp,
  ChevronDown,
  CaseSensitive,
  Regex,
  CornerDownLeft,
} from "lucide-react";
import { useAnon } from "@/lib/store";
import { toast } from "sonner";

export function FindBar() {
  const s = useAnon();
  const findRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [currentMatch, setCurrentMatch] = useState(0);

  const file = s.files.find((f) => f.id === s.activeFileId);
  const content = file?.content ?? "";

  // derived: compute matches via useMemo (no setState-in-effect)
  const matches = useMemo(() => {
    if (!s.findQuery || !content) return [];
    try {
      let re: RegExp;
      if (s.findRegex) {
        re = new RegExp(s.findQuery, s.findCaseSensitive ? "g" : "gi");
      } else {
        const escaped = s.findQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        re = new RegExp(escaped, s.findCaseSensitive ? "g" : "gi");
      }
      const ms: { start: number; end: number }[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        ms.push({ start: m.index, end: m.index + m[0].length });
        if (m.index === re.lastIndex) re.lastIndex++;
        if (ms.length > 999) break;
      }
      return ms;
    } catch {
      return [];
    }
  }, [s.findQuery, content, s.findCaseSensitive, s.findRegex]);

  const matchCount = matches.length;

  // keep store in sync with match count (in an effect to avoid setState-during-render)
  useEffect(() => {
    s.setFindMatch(Math.min(currentMatch, Math.max(0, matchCount - 1)), matchCount);
  }, [matchCount, currentMatch]);

  function scrollToMatch(m: { start: number; end: number }) {
    const ta = document.querySelector("textarea");
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(m.start, m.end);
    const linesBefore = content.substring(0, m.start).split("\n").length - 1;
    ta.scrollTop = Math.max(0, linesBefore * 13 * 1.6 - 60);
  }

  // focus input on open
  useEffect(() => {
    if (s.findOpen) {
      setTimeout(() => findRef.current?.focus(), 50);
    }
  }, [s.findOpen]);

  function next() {
    if (matches.length === 0) return;
    const n = (currentMatch + 1) % matches.length;
    setCurrentMatch(n);
    s.setFindMatch(n, matches.length);
    scrollToMatch(matches[n]);
  }
  function prev() {
    if (matches.length === 0) return;
    const n = (currentMatch - 1 + matches.length) % matches.length;
    setCurrentMatch(n);
    s.setFindMatch(n, matches.length);
    scrollToMatch(matches[n]);
  }

  function replaceOne() {
    if (matches.length === 0 || !file) return;
    const m = matches[currentMatch];
    const newContent = content.substring(0, m.start) + s.replaceQuery + content.substring(m.end);
    s.updateFileContent(file.id, newContent);
    toast.success(`Replaced match ${currentMatch + 1}`);
  }

  function replaceAll() {
    if (matches.length === 0 || !file) return;
    let newContent = content;
    let offset = 0;
    for (const m of matches) {
      newContent = newContent.substring(0, m.start + offset) + s.replaceQuery + newContent.substring(m.end + offset);
      offset += s.replaceQuery.length - (m.end - m.start);
    }
    s.updateFileContent(file.id, newContent);
    toast.success(`Replaced ${matches.length} matches`);
  }

  // keyboard nav
  useEffect(() => {
    if (!s.findOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        next();
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") {
        e.preventDefault();
        s.toggleFind();
      } else if (e.key === "h" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        replaceOne();
      } else if (e.key === "l" && e.altKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        replaceAll();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s.findOpen, matches, currentMatch]);

  if (!s.findOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.14, ease: [0.22, 0.61, 0.36, 1] }}
        className="flex-none hairline-b anon-raise px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5 anon-accent flex-none" />
          {/* find input */}
          <input
            ref={findRef}
            value={s.findQuery}
            onChange={(e) => s.setFindQuery(e.target.value)}
            placeholder="find"
            className="anon-mono flex-1 bg-[var(--anon-bg)] hairline px-2 py-1 text-xs anon-fg outline-none focus:border-[var(--anon-accent)]"
          />
          {/* toggle buttons */}
          <button
            onClick={() => s.toggleFindCaseSensitive()}
            className={`anon-mono inline-flex h-7 w-7 items-center justify-center hairline text-[10px] ${
              s.findCaseSensitive ? "bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] border-[var(--anon-accent)]" : "anon-mut hover:bg-[var(--anon-panel)]"
            }`}
            title="Match case"
          >
            <CaseSensitive className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => s.toggleFindRegex()}
            className={`anon-mono inline-flex h-7 w-7 items-center justify-center hairline text-[10px] ${
              s.findRegex ? "bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] border-[var(--anon-accent)]" : "anon-mut hover:bg-[var(--anon-panel)]"
            }`}
            title="Regular expression"
          >
            <Regex className="h-3.5 w-3.5" />
          </button>
          {/* match counter */}
          <span className="anon-mono w-16 text-right text-[10px] anon-mut">
            {matches.length > 0 ? `${currentMatch + 1}/${matches.length}` : "0/0"}
          </span>
          {/* prev / next */}
          <button
            onClick={prev}
            disabled={matches.length === 0}
            className="anon-mono inline-flex h-7 w-7 items-center justify-center hairline anon-mut hover:bg-[var(--anon-panel)] hover:anon-fg disabled:opacity-30"
            title="Previous (⇧↵)"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={next}
            disabled={matches.length === 0}
            className="anon-mono inline-flex h-7 w-7 items-center justify-center hairline anon-mut hover:bg-[var(--anon-panel)] hover:anon-fg disabled:opacity-30"
            title="Next (↵)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => s.toggleFind()}
            className="anon-mut hover:anon-fg"
            aria-label="Close find"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* replace row */}
        <div className="mt-1.5 flex items-center gap-2">
          <Replace className="h-3.5 w-3.5 anon-mut flex-none" />
          <input
            ref={replaceRef}
            value={s.replaceQuery}
            onChange={(e) => s.setReplaceQuery(e.target.value)}
            placeholder="replace"
            className="anon-mono flex-1 bg-[var(--anon-bg)] hairline px-2 py-1 text-xs anon-fg outline-none focus:border-[var(--anon-accent)]"
          />
          <button
            onClick={replaceOne}
            disabled={matches.length === 0}
            className="anon-mono inline-flex items-center gap-1 hairline px-2 py-1 text-[10px] anon-mut hover:bg-[var(--anon-panel)] hover:anon-fg disabled:opacity-30"
            title="Replace one (⌘H)"
          >
            replace <CornerDownLeft className="h-2.5 w-2.5" />
          </button>
          <button
            onClick={replaceAll}
            disabled={matches.length === 0}
            className="anon-mono inline-flex items-center gap-1 bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] px-2 py-1 text-[10px] disabled:opacity-30 hover:brightness-110"
            title="Replace all (⌘⌥L)"
          >
            all {matches.length}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
