"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Bookmark, Clock, Trash2, Lock, Star, ArrowRight, Search } from "lucide-react";
import { useState } from "react";
import { useAnon } from "@/lib/store";
import { toast } from "sonner";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + "m ago";
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + "h ago";
  return Math.floor(diff / 86_400_000) + "d ago";
}

export function BookmarksDrawer() {
  const s = useAnon();
  const [q, setQ] = useState("");
  if (!s.bookmarksOpen) return null;

  const filtered = q
    ? s.recentRooms.filter(
        (r) => r.code.toLowerCase().includes(q.toLowerCase()) || r.title.toLowerCase().includes(q.toLowerCase()),
      )
    : s.recentRooms;

  function rejoin(code: string) {
    s.enterRoom({ code, isOwner: false });
    toast.success(`Rejoining ${code}`, { description: "Same room, fresh session." });
    s.toggleBookmarks();
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
        onClick={() => s.toggleBookmarks()}
      >
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-full w-full max-w-md flex-col bg-[var(--anon-panel)] hairline-l shadow-2xl shadow-black/50"
        >
          {/* header */}
          <div className="flex h-11 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              <Bookmark className="h-4 w-4 anon-accent" /> Recent rooms
              <span className="anon-mono text-[10px] anon-dim">· {s.recentRooms.length}</span>
            </h2>
            <button onClick={() => s.toggleBookmarks()} className="anon-mut hover:anon-fg">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* search */}
          <div className="hairline-b p-3">
            <div className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5 anon-mut" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="filter by code or title…"
                className="anon-mono flex-1 bg-[var(--anon-bg)] hairline px-2 py-1.5 text-xs outline-none focus:border-[var(--anon-accent)]"
                autoFocus
              />
            </div>
          </div>

          {/* list */}
          <div className="anon-scroll flex-1 overflow-y-auto p-2">
            {filtered.length === 0 && (
              <div className="anon-mono py-10 text-center text-xs anon-mut">
                {s.recentRooms.length === 0 ? "no recent rooms yet" : `no matches for "${q}"`}
              </div>
            )}
            {filtered.map((r) => (
              <div
                key={r.code}
                className="group mb-1.5 hairline bg-[var(--anon-bg)] p-3 hover:bg-[var(--anon-raise)] cursor-pointer transition-colors"
                onClick={() => rejoin(r.code)}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base flex-none">{r.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="anon-mono truncate text-xs anon-fg">{r.title}</div>
                    <div className="anon-mono flex items-center gap-1.5 text-[10px] anon-dim">
                      <span className="anon-accent">{r.code}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" /> {relativeTime(r.visitedAt)}
                      </span>
                      {r.hasPassword && (
                        <>
                          <span>·</span>
                          <Lock className="h-2.5 w-2.5" style={{ color: "var(--anon-warn)" }} />
                        </>
                      )}
                      {r.isOwner && (
                        <>
                          <span>·</span>
                          <Star className="h-2.5 w-2.5" style={{ color: "var(--anon-warn)" }} />
                        </>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 flex-none anon-mut opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity anon-accent" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      s.removeRecentRoom(r.code);
                      toast.success("Removed from recents");
                    }}
                    className="anon-mut hover:anon-fg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-none p-1"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="hairline-t px-3 py-1.5 anon-mono text-[10px] anon-dim flex items-center justify-between">
            <span>stored locally · click to rejoin</span>
            <span>{filtered.length} of {s.recentRooms.length}</span>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
