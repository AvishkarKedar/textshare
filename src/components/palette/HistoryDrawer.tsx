"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, History, RotateCcw, Download, Bookmark, Trash2, Plus, GitCompareArrows } from "lucide-react";
import { useAnon } from "@/lib/store";
import { toast } from "sonner";

const TIMELINE = [
  { t: "now", label: "current", who: "you", color: "#4c8dff", code: `function shareRoom(code, opts = {}) {
  const key  = deriveKey(code, opts.password)
  const auth = deriveAuth(code, opts.password)
  return connect(\`wss://relay/\${code}\`, { key, auth })
}` },
  { t: "-2m", label: "saved checkpoint", who: "Avishkar", color: "#3ddc84", code: `function shareRoom(code, opts = {}) {
  const key  = deriveKey(code, opts.password)
  const auth = deriveAuth(code, opts.password)
  return connect(\`wss://relay/\${code}\`, { key, auth })
}` },
  { t: "-8m", label: "deriveKey split", who: "Avishkar", color: "#3ddc84", code: `function shareRoom(code, opts = {}) {
  const key = deriveKey(code, opts.password)
  return connect(\`wss://relay/\${code}\`, { key })
}` },
  { t: "-14m", label: "first paste", who: "Lazarus", color: "#c792ea", code: `function shareRoom(code) {
  return connect(\`wss://relay/\${code}\`)
}` },
  { t: "-22m", label: "room created", who: "you", color: "#4c8dff", code: `` },
];

/** Simple LCS-based line diff. Returns array of {type, line} entries. */
export function diffLines(a: string, b: string): { type: "ctx" | "add" | "del"; text: string }[] {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  // build LCS table
  const m = aLines.length, n = bLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = aLines[i] === bLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: { type: "ctx" | "add" | "del"; text: string }[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      out.push({ type: "ctx", text: aLines[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: aLines[i] });
      i++;
    } else {
      out.push({ type: "add", text: bLines[j] });
      j++;
    }
  }
  while (i < m) out.push({ type: "del", text: aLines[i++] });
  while (j < n) out.push({ type: "add", text: bLines[j++] });
  return out;
}

export function HistoryDrawer() {
  const s = useAnon();
  const [pos, setPos] = useState(0);
  const [diffPos, setDiffPos] = useState(4); // compare against this timeline idx
  const [mode, setMode] = useState<"snapshot" | "diff">("snapshot");

  if (!s.historyOpen) return null;

  // map timeline idx to slider percentage for marker positioning
  const idxToPct = (idx: number) => (idx / (TIMELINE.length - 1)) * 100;

  const current = TIMELINE[pos];
  const diffTarget = TIMELINE[diffPos];
  const diffResult = mode === "diff" ? diffLines(diffTarget.code, current.code) : [];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
        onClick={() => s.toggleHistory()}
      >
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-full w-full max-w-md flex-col bg-[var(--anon-panel)] hairline-l shadow-2xl shadow-black/50"
        >
          <div className="flex h-11 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 anon-accent" /> Time machine
            </h2>
            <button onClick={() => s.toggleHistory()} className="anon-mut hover:anon-fg">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="hairline-b flex p-3 gap-2">
            <button
              onClick={() => setMode("snapshot")}
              className={`anon-mono flex-1 py-1.5 text-xs hairline ${mode === "snapshot" ? "bg-[var(--anon-accent)] text-[var(--anon-accent-fg)]" : "hover:bg-[var(--anon-raise)]"}`}
            >
              snapshot
            </button>
            <button
              onClick={() => setMode("diff")}
              className={`anon-mono flex-1 py-1.5 text-xs hairline ${mode === "diff" ? "bg-[var(--anon-accent)] text-[var(--anon-accent-fg)]" : "hover:bg-[var(--anon-raise)]"}`}
            >
              diff
            </button>
          </div>

          {/* timeline with named-snapshot markers */}
          <div className="p-4 hairline-b">
            <div className="anon-mono mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider anon-dim">
              <span>drag to travel</span>
              <span className="inline-flex items-center gap-1">
                <Bookmark className="h-2.5 w-2.5" /> {s.snapshots.length} named
              </span>
            </div>
            <div className="relative py-3">
              <input
                type="range"
                min={0}
                max={TIMELINE.length - 1}
                value={pos}
                onChange={(e) => setPos(Number(e.target.value))}
                className="w-full accent-[var(--anon-accent)]"
              />
              {/* named snapshot markers overlay */}
              <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2">
                {s.snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="absolute -translate-x-1/2"
                    style={{ left: `${idxToPct(snap.timelineIdx)}%` }}
                    title={`${snap.label} · ${snap.author}`}
                  >
                    <span
                      className="block h-3 w-1"
                      style={{ background: snap.color }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full anim-beat" style={{ background: TIMELINE[pos].color }} />
              <span className="anon-mono text-xs anon-fg">{TIMELINE[pos].label}</span>
              <span className="anon-mono ml-auto text-[10px] anon-dim">{TIMELINE[pos].t} · {TIMELINE[pos].who}</span>
            </div>
          </div>

          {/* named snapshots list + name-this-moment */}
          <div className="p-4 hairline-b">
            <div className="anon-mono mb-2 text-[10px] uppercase tracking-wider anon-dim">
              name this moment
            </div>
            <div className="flex items-center gap-2">
              <input
                value={s.newSnapLabel}
                onChange={(e) => s.setNewSnapLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && s.newSnapLabel.trim()) {
                    s.addSnapshot(s.newSnapLabel);
                    toast.success("Snapshot bookmarked", { description: s.newSnapLabel.trim() });
                  }
                }}
                placeholder="v2 — after refactor"
                className="anon-mono flex-1 bg-[var(--anon-bg)] hairline px-2 py-1.5 text-xs outline-none focus:border-[var(--anon-accent)]"
              />
              <button
                onClick={() => {
                  if (s.newSnapLabel.trim()) {
                    s.addSnapshot(s.newSnapLabel);
                    toast.success("Snapshot bookmarked", { description: s.newSnapLabel.trim() });
                  }
                }}
                disabled={!s.newSnapLabel.trim()}
                className="anon-mono inline-flex h-7 w-7 items-center justify-center bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] disabled:opacity-50"
                title="Bookmark"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* existing snapshots */}
            {s.snapshots.length > 0 && (
              <div className="mt-3 space-y-1">
                {s.snapshots.map((snap) => (
                  <div key={snap.id} className="flex items-center gap-2 px-2 py-1.5 hairline bg-[var(--anon-bg)]">
                    <Bookmark className="h-3 w-3 flex-none" style={{ color: snap.color }} />
                    <span className="anon-mono truncate text-[11px] anon-fg">{snap.label}</span>
                    <span className="anon-mono ml-auto text-[9px] anon-dim">{snap.author}</span>
                    <button
                      onClick={() => {
                        s.removeSnapshot(snap.id);
                        toast.success("Snapshot removed");
                      }}
                      className="anon-mut hover:anon-fg"
                      title="Remove"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* preview */}
          <div className="flex-1 overflow-y-auto anon-scroll p-4">
            <div className="anon-mono mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider anon-dim">
              <span>{mode === "snapshot" ? "snapshot" : "diff vs current"}</span>
              {mode === "diff" && (
                <span className="inline-flex items-center gap-1.5">
                  <GitCompareArrows className="h-2.5 w-2.5" />
                  {diffTarget.label} → {current.label}
                </span>
              )}
            </div>

            {mode === "snapshot" ? (
              <pre className="anon-mono anon-scroll hairline bg-[var(--anon-bg)] p-3 text-[11px] leading-snug anon-fg overflow-x-auto">
                <code>{current.code || "// (empty — nothing saved yet at this point)"}</code>
              </pre>
            ) : (
              <>
                {/* diff target selector */}
                <div className="mb-2 flex items-center gap-2">
                  <span className="anon-mono text-[10px] anon-dim">compare against:</span>
                  <select
                    value={diffPos}
                    onChange={(e) => setDiffPos(Number(e.target.value))}
                    className="anon-mono bg-[var(--anon-bg)] hairline px-2 py-1 text-[10px] anon-fg outline-none"
                  >
                    {TIMELINE.map((t, i) => (
                      <option key={i} value={i}>{t.label} ({t.t})</option>
                    ))}
                  </select>
                </div>
                {/* diff output */}
                <div className="anon-mono hairline bg-[var(--anon-bg)] text-[11px] leading-snug overflow-x-auto">
                  {diffResult.map((d, i) => (
                    <div
                      key={i}
                      className="px-3 py-0.5 whitespace-pre"
                      style={{
                        background:
                          d.type === "add"
                            ? "color-mix(in srgb, var(--anon-ok) 12%, transparent)"
                            : d.type === "del"
                              ? "color-mix(in srgb, var(--anon-danger) 12%, transparent)"
                              : "transparent",
                        color:
                          d.type === "add"
                            ? "var(--anon-ok)"
                            : d.type === "del"
                              ? "var(--anon-danger)"
                              : "var(--anon-fg)",
                      }}
                    >
                      <span className="anon-dim select-none mr-2">
                        {d.type === "add" ? "+" : d.type === "del" ? "−" : " "}
                      </span>
                      {d.text || "\u00A0"}
                    </div>
                  ))}
                </div>
                {/* diff stats */}
                <div className="anon-mono mt-2 flex items-center gap-3 text-[10px] anon-dim">
                  <span className="inline-flex items-center gap-1" style={{ color: "var(--anon-ok)" }}>
                    +{diffResult.filter((d) => d.type === "add").length} added
                  </span>
                  <span className="inline-flex items-center gap-1" style={{ color: "var(--anon-danger)" }}>
                    −{diffResult.filter((d) => d.type === "del").length} removed
                  </span>
                  <span>· {diffResult.filter((d) => d.type === "ctx").length} unchanged</span>
                </div>
              </>
            )}
          </div>

          {/* actions */}
          <div className="hairline-t p-3 flex gap-2">
            <button
              onClick={() => {
                if (s.activeFileId) {
                  s.updateFileContent(s.activeFileId, TIMELINE[pos].code);
                }
                toast.success("Reverted", { description: `Editor restored to ${TIMELINE[pos].label}` });
                s.toggleHistory();
              }}
              className="anon-mono inline-flex h-9 flex-1 items-center justify-center gap-1.5 bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] text-xs hover:brightness-110 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Revert to here
            </button>
            <button
              onClick={() => {
                const name = `snapshot-${TIMELINE[pos].label.replace(/\s+/g, "-")}.js`;
                s.addFile(name, "javascript");
                setTimeout(() => {
                  const state = useAnon.getState();
                  const targetId = state.activeFileId;
                  if (targetId) state.updateFileContent(targetId, TIMELINE[pos].code);
                }, 50);
                toast.success("Saved as new tab", { description: name });
                s.toggleHistory();
              }}
              className="anon-mono inline-flex h-9 items-center justify-center gap-1.5 hairline px-3 text-xs hover:bg-[var(--anon-raise)] cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" /> Save as tab
            </button>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
