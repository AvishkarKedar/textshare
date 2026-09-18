"use client";

import { useEffect, useRef, useState } from "react";
import { useAnon, SLASH_COMMANDS, type SlashCommand } from "@/lib/store";
import { CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";

interface Props {
  anchorRect: DOMRect | null;
  onPick: (cmd: SlashCommand) => void;
  onClose: () => void;
}

export function SlashCommandPopup({ anchorRect, onPick, onClose }: Props) {
  const s = useAnon();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // filter
  const filtered = q
    ? SLASH_COMMANDS.filter((c) => c.trigger.includes(q.toLowerCase()) || c.label.toLowerCase().includes(q.toLowerCase()))
    : SLASH_COMMANDS;

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
        if (filtered[sel]) onPick(filtered[sel]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, sel, onPick, onClose]);

  if (!anchorRect) return null;

  const safeSel = Math.min(sel, Math.max(0, filtered.length - 1));

  return (
    <div
      ref={ref}
      className="fixed z-50 w-72 hairline anon-panel shadow-2xl shadow-black/40 anim-rise"
      style={{ top: anchorRect.bottom + 4, left: anchorRect.left }}
    >
      <div className="flex h-7 items-center gap-2 hairline-b px-3">
        <span className="anon-mono text-[10px] uppercase tracking-wider anon-dim">
          slash commands
        </span>
        <span className="anon-mono ml-auto text-[10px] anon-dim">
          {filtered.length}
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto anon-scroll p-1">
        {filtered.length === 0 && (
          <div className="anon-mono px-3 py-4 text-center text-[11px] anon-mut">
            no matches for &quot;/{q}&quot;
          </div>
        )}
        {filtered.map((c, i) => {
          const active = i === safeSel;
          return (
            <button
              key={c.id}
              onMouseEnter={() => setSel(i)}
              onClick={() => onPick(c)}
              className={`flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left anon-mono text-[11px] ${active ? "bg-[var(--anon-raise)]" : ""}`}
            >
              <span
                className={`inline-flex h-5 w-5 flex-none items-center justify-center text-[10px] ${active ? "anon-accent" : "anon-mut"}`}
              >
                {c.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className={active ? "anon-fg" : "anon-mut"}>
                  <span className="anon-accent">{c.trigger}</span>{" "}
                  <span className="anon-dim">{c.label}</span>
                </div>
                <div className="anon-dim truncate text-[10px]">{c.hint}</div>
              </div>
              {active && <CornerDownLeft className="h-3 w-3 flex-none anon-accent" />}
            </button>
          );
        })}
      </div>
      <div className="hairline-t flex items-center gap-3 px-3 py-1 anon-mono text-[9px] anon-dim">
        <span className="inline-flex items-center gap-0.5">
          <ArrowUp className="h-2.5 w-2.5" />
          <ArrowDown className="h-2.5 w-2.5" /> navigate
        </span>
        <span>↵ select</span>
        <span>esc close</span>
      </div>
    </div>
  );
}
