"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, History, RotateCcw, Download, Bookmark, Trash2, Plus, GitCompareArrows } from "lucide-react";
import { useAnon } from "@/lib/store";
import { toast } from "sonner";

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

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `-${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `-${Math.floor(diff / 3_600_000)}h`;
  return `-${Math.floor(diff / 86_400_000)}d`;
}

export function HistoryDrawer() {
  const s = useAnon();
  const [mode, setMode] = useState<"snapshot" | "diff">("snapshot");
  const [pos, setPos] = useState<number | null>(null);

  if (!s.historyOpen) return null;

  // REAL history: snapshots recorded from actual document content while the
  // session is live (local + remote edits), newest last.
  const fileHist = s.docHistory.filter((h) => h.fileId === s.activeFileId);
  const timeline = [
    ...fileHist,
    // the live editor content is always the last stop on the timeline
    {
      id: "live",
      fileId: s.activeFileId,
      fileName: s.files.find((f) => f.id === s.activeFileId)?.name || "",
      ts: Date.now(),
      content: s.files.find((f) => f.id === s.activeFileId)?.content ?? "",
      author: s.displayName || "you",
      color: s.color,
      authorId: "me",
      label: "current",
    },
  ];
  const posIdx = pos === null || pos >= timeline.length ? timeline.length - 1 : pos;
  const current = timeline[posIdx];
  const diffTarget = timeline[Math.max(0, Math.min(posIdx > 0 ? posIdx - 1 : 0, timeline.length - 1))];
  const diffResult = mode === "diff" ? diffLines(diffTarget.content, current.content) : [];

  const namedById = new Map(s.snapshots.map((sn) => [sn.historyId, sn.label]));

  function revert() {
    if (!current || current.id === "live") {
      toast("You're already at the current state");
      return;
    }
    if (s.activeFileId) {
      s.updateFileContent(s.activeFileId, current.content);
      toast.success("Reverted", {
        description: `Editor restored to the state from ${new Date(current.ts).toLocaleTimeString()}`,
      });
    }
    s.toggleHistory();
  }

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
              <History className="h-4 w-4 anon-accent" /> History · {current?.fileName || "file"}
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
              disabled={timeline.length < 2}
              className={`anon-mono flex-1 py-1.5 text-xs hairline ${mode === "diff" ? "bg-[var(--anon-accent)] text-[var(--anon-accent-fg)]" : "hover:bg-[var(--anon-raise)]"} disabled:opacity-40`}
            >
              diff vs previous
            </button>
          </div>

          {timeline.length <= 1 ? (
            <div className="anon-scroll flex-1 overflow-y-auto p-4">
              <div className="anon-mono text-[11px] anon-dim leading-relaxed">
                <p className="mb-2">No history yet for this file.</p>
                <p>
                  Snapshots are recorded automatically as you and your peers edit (every ~12 s of
                  activity). Type something, then come back — or bookmark this moment below to
                  force a snapshot now.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* real timeline */}
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
                    max={timeline.length - 1}
                    value={posIdx}
                    onChange={(e) => setPos(Number(e.target.value))}
                    className="w-full accent-[var(--anon-accent)]"
                  />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className="anon-mono inline-flex h-4 items-center px-1 text-[9px] font-semibold text-black"
                    style={{ background: current.color }}
                  >
                    {current.author}
                  </span>
                  <span className="anon-mono text-xs anon-fg">
                    {current.label || namedById.get(current.id) || (current.id === "live" ? "current" : "auto snapshot")}
                  </span>
                  <span className="anon-mono ml-auto text-[10px] anon-dim">
                    {relTime(current.ts)} · {current.content.split("\n").length} lines · {current.content.length} chars
                  </span>
                </div>
              </div>

              {/* name-this-moment */}
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

              {/* preview / diff of REAL content */}
              <div className="flex-1 overflow-y-auto anon-scroll p-4">
                <div className="anon-mono mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider anon-dim">
                  <span>{mode === "snapshot" ? "snapshot content" : "changes since previous snapshot"}</span>
                  {mode === "diff" && (
                    <span className="inline-flex items-center gap-1.5">
                      <GitCompareArrows className="h-2.5 w-2.5" />
                      {relTime(diffTarget.ts)} → {relTime(current.ts)}
                    </span>
                  )}
                </div>

                {mode === "snapshot" ? (
                  <pre className="anon-mono anon-scroll hairline bg-[var(--anon-bg)] p-3 text-[11px] leading-snug anon-fg overflow-x-auto">
                    <code>{current.content || "// (empty file at this point)"}</code>
                  </pre>
                ) : (
                  <>
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
                    <div className="anon-mono mt-2 flex items-center gap-3 text-[10px] anon-dim">
                      <span style={{ color: "var(--anon-ok)" }}>
                        +{diffResult.filter((d) => d.type === "add").length} added
                      </span>
                      <span style={{ color: "var(--anon-danger)" }}>
                        −{diffResult.filter((d) => d.type === "del").length} removed
                      </span>
                      <span>· {diffResult.filter((d) => d.type === "ctx").length} unchanged</span>
                    </div>
                  </>
                )}
              </div>

              {/* actions — all real: revert routes through the E2EE doc */}
              <div className="hairline-t p-3 flex gap-2">
                <button
                  onClick={revert}
                  disabled={current.id === "live"}
                  className="anon-mono inline-flex h-9 flex-1 items-center justify-center gap-1.5 bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] text-xs hover:brightness-110 cursor-pointer disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Revert to here
                </button>
                <button
                  onClick={() => {
                    const name = `${(current.fileName || "snapshot").replace(/\.[^.]+$/, "")}-${relTime(current.ts).replace(/-/g, "")}.txt`;
                    s.addFile(name, "text");
                    setTimeout(() => {
                      const state = useAnon.getState();
                      const targetId = state.activeFileId;
                      if (targetId) state.updateFileContent(targetId, current.content);
                    }, 50);
                    toast.success("Saved as new tab", { description: name });
                    s.toggleHistory();
                  }}
                  className="anon-mono inline-flex h-9 items-center justify-center gap-1.5 hairline px-3 text-xs hover:bg-[var(--anon-raise)] cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" /> Save as tab
                </button>
              </div>
            </>
          )}
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
