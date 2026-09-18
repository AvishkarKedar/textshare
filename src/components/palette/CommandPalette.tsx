"use client";

import { useEffect, useState, useMemo } from "react";
import { useAnon } from "@/lib/store";
import {
  Search,
  Play,
  MessageSquare,
  Files,
  History,
  Settings,
  Link2,
  Maximize2,
  Sparkles,
  Globe,
  PenTool,
  Terminal,
  RotateCcw,
  Eye,
  LogOut,
  FlaskConical,
  Bell,
  Bookmark,
  Activity,
  Shield,
  CornerDownLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CmdItem {
  id: string;
  label: string;
  hint?: string;
  kbd?: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  run: () => void;
}

export function CommandPalette() {
  const s = useAnon();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const items = useMemo<CmdItem[]>(() => {
    const close = () => s.togglePalette();
    return [
      { id: "run", label: "Run code", kbd: "⌘↵", icon: Play, group: "editor", run: () => { close(); } },
      { id: "tests", label: "Run tests (parse test()/describe())", kbd: "⌘⇧T", icon: FlaskConical, group: "editor", run: () => { s.runTests(); close(); } },
      { id: "generative", label: "Generative UI builder", kbd: "⌘⇧G", icon: Sparkles, group: "tools", run: () => { s.toggleGenerative(); close(); } },
      { id: "chat", label: s.chatOpen ? "Close chat" : "Open chat", kbd: "⌘J", icon: MessageSquare, group: "view", run: () => { s.toggleChat(); close(); } },
      { id: "files", label: s.filesOpen ? "Close files" : "Open files", kbd: "⌘B", icon: Files, group: "view", run: () => { s.toggleFiles(); close(); } },
      { id: "preview", label: "Toggle markdown preview", kbd: "⌘⇧P", icon: Eye, group: "view", run: () => { s.toggleMdPreview(); close(); } },
      { id: "tour", label: "Restart onboarding tour", kbd: "⌘⇧O", icon: Sparkles, group: "config", run: () => { s.startTour(); close(); } },
      { id: "history", label: "Open history (time machine)", kbd: "⌘⇧H", icon: History, group: "view", run: () => { s.toggleHistory(); close(); } },
      { id: "whiteboard", label: "Open whiteboard", kbd: "⌘⇧W", icon: PenTool, group: "tools", run: () => { s.toggleWhiteboard(); close(); } },
      { id: "browser", label: "Open in-app browser", kbd: "⌘⇧B", icon: Globe, group: "tools", run: () => { s.toggleBrowser(); close(); } },
      { id: "terminal", label: "Toggle terminal", kbd: "⌘\\", icon: Terminal, group: "tools", run: () => { s.toggleTerminal(); close(); } },
      { id: "notifications", label: "Open notifications", kbd: "⌘N", icon: Bell, group: "view", run: () => { s.toggleNotifications(); close(); } },
      { id: "invite", label: "Invite others (copy link / QR)", kbd: "⌘I", icon: Link2, group: "share", run: () => { s.toggleInvite(); close(); } },
      { id: "bookmarks", label: "Open recent rooms", kbd: "⌘⇧R", icon: Bookmark, group: "navigation", run: () => { s.toggleBookmarks(); close(); } },
      { id: "status", label: "Open system status", kbd: "⌘⇧Y", icon: Activity, group: "tools", run: () => { s.toggleStatus(); close(); } },
      { id: "security", label: "Open threat model", kbd: "⌘⇧X", icon: Shield, group: "tools", run: () => { s.toggleSecurity(); close(); } },
      { id: "zen", label: s.zenMode ? "Exit zen mode" : "Enter zen mode", kbd: "⌘.", icon: Maximize2, group: "view", run: () => { s.toggleZen(); close(); } },
      { id: "settings", label: "Open settings", kbd: "⌘,", icon: Settings, group: "config", run: () => { s.toggleSettings(); close(); } },
      { id: "shortcuts", label: "Show keyboard shortcuts", kbd: "?", icon: RotateCcw, group: "config", run: () => { s.toggleShortcuts(); close(); } },
      { id: "leave", label: "Leave room", icon: LogOut, group: "room", run: () => { s.exitRoom(); } },
    ];
  }, [s]);

  const filtered = useMemo(() => {
    if (!q.trim()) {
      // no query: show recents first, then the rest
      const recents = s.paletteRecents
        .map((id) => items.find((it) => it.id === id))
        .filter(Boolean) as typeof items;
      const rest = items.filter((it) => !s.paletteRecents.includes(it.id));
      return [...recents, ...rest];
    }
    const ql = q.toLowerCase();
    // fuzzy: score by whether all chars appear in order (subsequence match)
    const scored = items
      .map((it) => {
        const label = it.label.toLowerCase();
        const group = it.group.toLowerCase();
        let score = 0;
        if (label.startsWith(ql)) score += 100;
        else if (label.includes(ql)) score += 50;
        if (group.includes(ql)) score += 10;
        // subsequence match
        let qi = 0;
        for (let i = 0; i < label.length && qi < ql.length; i++) {
          if (label[i] === ql[qi]) qi++;
        }
        if (qi === ql.length) score += 5;
        return { it, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((x) => x.it);
  }, [items, q, s.paletteRecents]);

  // keep selection in bounds when the filtered list shrinks
  const safeSel = Math.min(sel, Math.max(0, filtered.length - 1));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((v) => Math.min(v + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((v) => Math.max(v - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[safeSel];
        if (item) {
          s.trackPaletteUse(item.id);
          item.run();
        }
      }
    }
    if (s.paletteOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s.paletteOpen, filtered, safeSel]);

  if (!s.paletteOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm pt-[12vh] px-4"
        onClick={() => s.togglePalette()}
      >
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.14, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xl hairline anon-panel shadow-2xl shadow-black/50"
        >
          {/* search */}
          <div className="flex h-11 items-center gap-2 hairline-b px-3">
            <Search className="h-4 w-4 anon-mut" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type a command or search…"
              className="anon-mono flex-1 bg-transparent text-sm outline-none"
            />
            <kbd className="anon-mono text-[10px] anon-dim hairline px-1.5 py-0.5">esc</kbd>
          </div>

          {/* results */}
          <div className="max-h-[50vh] overflow-y-auto anon-scroll p-1.5">
            {filtered.length === 0 && (
              <div className="anon-mono px-3 py-6 text-center text-xs anon-mut">
                no matches for &quot;{q}&quot;
              </div>
            )}
            {filtered.map((it, i) => {
              const Icon = it.icon;
              const active = i === safeSel;
              return (
                <button
                  key={it.id}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => {
                    s.trackPaletteUse(it.id);
                    it.run();
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left anon-mono text-xs transition-colors ${
                    active ? "bg-[var(--anon-raise)]" : ""
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${active ? "anon-accent" : "anon-mut"}`} />
                  <span className={active ? "anon-fg" : "anon-mut"}>{it.label}</span>
                  <span className="anon-dim ml-1 text-[10px]">{it.group}</span>
                  {it.kbd && (
                    <span className="ml-auto anon-dim text-[10px] hairline px-1.5 py-0.5">{it.kbd}</span>
                  )}
                  {active && <CornerDownLeft className="h-3 w-3 anon-accent" />}
                </button>
              );
            })}
          </div>

          {/* footer */}
          <div className="hairline-t flex items-center gap-3 px-3 py-1.5 anon-mono text-[10px] anon-dim">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc close</span>
            <span className="ml-auto">{filtered.length} commands</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
