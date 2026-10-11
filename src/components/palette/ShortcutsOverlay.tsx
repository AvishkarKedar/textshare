"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useAnon, SHORTCUTS } from "@/lib/store";

export function ShortcutsOverlay() {
  const s = useAnon();
  if (!s.shortcutsOpen) return null;

  // Defensive grouping: SHORTCUTS entries may declare any group id
  // (global / navigation / editor / tools / future ones) — a group missing
  // from the map below must never crash the overlay (v5.6 regression: the
  // "tools" entries were added to SHORTCUTS but not to the map, so
  // groups[sc.group].push threw and took the whole app down).
  const groups: Record<string, typeof SHORTCUTS> = {};
  SHORTCUTS.forEach((sc) => {
    (groups[sc.group] ??= []).push(sc);
  });
  const groupOrder = ["global", "navigation", "editor", "tools"];
  const shownGroups = groupOrder.filter((g) => (groups[g]?.length ?? 0) > 0);
  // any group not in the canonical order still gets rendered (never dropped)
  const extraGroups = Object.keys(groups).filter(
    (g) => !groupOrder.includes(g) && groups[g].length > 0
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm pt-[10vh] px-4"
        onClick={() => s.toggleShortcuts()}
      >
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.14 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl hairline anon-panel shadow-2xl shadow-black/50"
        >
          <div className="flex h-11 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans text-sm font-semibold">Keyboard shortcuts</h2>
            <button onClick={() => s.toggleShortcuts()} className="anon-mut hover:anon-fg">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...shownGroups, ...extraGroups].map((g) => (
              <div key={g}>
                <div className="anon-mono mb-2 text-[10px] uppercase tracking-wider anon-dim">
                  {g}
                </div>
                <ul className="space-y-1.5">
                  {groups[g].map((sc) => {
                    const custom = s.customKeys[sc.label];
                    const display = custom || sc.keys;
                    const isCustom = custom && custom !== sc.keys;
                    return (
                      <li key={sc.keys + sc.label} className="flex items-center justify-between gap-2">
                        <span className="anon-sans text-xs anon-mut">{sc.label}</span>
                        <kbd
                          className={`anon-mono hairline bg-[var(--anon-bg)] px-1.5 py-0.5 text-[10px] ${isCustom ? "anon-accent border-[var(--anon-accent)]" : "anon-fg"}`}
                          title={isCustom ? `custom (default: ${sc.keys})` : undefined}
                        >
                          {display}
                        </kbd>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="hairline-t px-4 py-2 anon-mono text-[10px] anon-dim flex items-center justify-between">
            <span>Tip: hold ⌘ and tap a few keys — muscle memory builds fast.</span>
            <span>remap in Settings (⌘,) · double-click a tab to rename it</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
