"use client";

import { Play, FolderOpen, MessageSquare, Undo2, Redo2, MoreHorizontal } from "lucide-react";
import { useAnon } from "@/lib/store";

export function MobileNav() {
  const s = useAnon();
  const canUndo = s.docHistory.length - s.undoDepth >= 2;
  const canRedo = s.undoDepth > 0;

  return (
    <>
      {/* floating action button — Run (sits above the accessory keys bar) */}
      <button
        onClick={() => s.runCode()}
        disabled={s.running}
        className="fixed right-3 z-30 inline-flex h-12 w-12 items-center justify-center bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] shadow-lg shadow-black/40 transition-transform active:scale-95 disabled:opacity-60 md:hidden"
        style={{ bottom: "calc(5.75rem + env(safe-area-inset-bottom, 0px))" }}
        title="Run code"
        aria-label="Run code"
      >
        <Play className={`h-5 w-5 ${s.running ? "animate-spin" : ""}`} />
      </button>

      {/* bottom nav — respects the home-indicator safe area on iOS */}
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-20 flex items-stretch hairline-t anon-raise md:hidden"
        aria-label="Mobile navigation"
      >
        <NavBtn icon={FolderOpen} label="files" onClick={() => s.toggleFiles()} active={s.filesOpen} />
        <NavBtn icon={MessageSquare} label="chat" onClick={() => s.toggleChat()} active={s.chatOpen} />
        <NavBtn
          icon={Undo2}
          label="undo"
          onClick={() => s.undoEdit()}
          disabled={!canUndo}
        />
        <NavBtn
          icon={Redo2}
          label="redo"
          onClick={() => s.redoEdit()}
          disabled={!canRedo}
        />
        <NavBtn icon={MoreHorizontal} label="more" onClick={() => s.togglePalette()} />
      </nav>

      {/* accessory keys bar (above bottom nav) — 40px keys for finger taps */}
      <div
        className="fixed inset-x-0 z-10 flex h-10 items-stretch hairline-t anon-panel anon-mono text-sm anon-mut md:hidden overflow-x-auto no-scrollbar"
        style={{ bottom: "calc(3rem + env(safe-area-inset-bottom, 0px))" }}
        aria-label="Code symbol keys"
      >
        {["{", "}", "(", ")", "[", "]", ";", "=", '"', "'", "/", "Tab", "=>"].map((k) => (
          <button
            key={k}
            onClick={() => {
              const ta = document.querySelector("textarea");
              if (ta) {
                ta.focus();
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                ta.setRangeText(k === "Tab" ? "\t" : k, start, end, "end");
                // React's onChange only fires on real input events — dispatch
                // one so the edit reaches the store AND the encrypted sync.
                ta.dispatchEvent(new Event("input", { bubbles: true }));
              }
            }}
            className="flex h-10 min-w-10 flex-none items-center justify-center px-2 hover:bg-[var(--anon-raise)] active:bg-[var(--anon-raise)]"
          >
            {k}
          </button>
        ))}
      </div>
    </>
  );
}

function NavBtn({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-12 min-w-12 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] anon-mono transition-opacity ${
        active ? "anon-accent bg-[var(--anon-panel)]" : "anon-mut"
      } ${disabled ? "opacity-30" : ""}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
