"use client";

import { FolderOpen, MessageSquare, Undo2, Redo2, MoreHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { useAnon } from "@/lib/store";

export function MobileNav() {
  const s = useAnon();
  const canUndo = s.docHistory.length - s.undoDepth >= 2;
  const canRedo = s.undoDepth > 0;

  return (
    <>
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

      {/* accessory keys bar (above bottom nav) — 40px keys for finger taps.
          Collapsible so the editor gets the full viewport height back when
          symbol keys aren't needed; a small pill above the nav re-opens it. */}
      {!s.mbarCollapsed ? (
        <div
          className="fixed inset-x-0 z-10 flex h-10 items-stretch hairline-t anon-panel anon-mono text-sm anon-mut md:hidden"
          style={{ bottom: "calc(3rem + env(safe-area-inset-bottom, 0px))" }}
          aria-label="Code symbol keys"
        >
          {/* collapse toggle — leading so it never scrolls out of reach */}
          <button
            onClick={() => s.toggleMbar()}
            aria-label="Hide symbol keys"
            title="Hide symbol keys"
            className="flex h-10 w-10 flex-none items-center justify-center hairline-r hover:bg-[var(--anon-raise)] active:bg-[var(--anon-raise)]"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <div className="flex h-10 flex-1 items-stretch overflow-x-auto no-scrollbar">
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
        </div>
      ) : (
        <button
          onClick={() => s.toggleMbar()}
          aria-label="Show symbol keys"
          title="Show symbol keys"
          className="anon-panel hairline flex h-7 w-10 flex-none items-center justify-center rounded-md anon-mut active:bg-[var(--anon-raise)] md:hidden"
          style={{
            position: "fixed",
            right: "0.5rem",
            bottom: "calc(3rem + env(safe-area-inset-bottom, 0px) + 0.5rem)",
            zIndex: 10,
          }}
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      )}
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
