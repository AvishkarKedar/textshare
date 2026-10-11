"use client";

import { useState } from "react";
import { X, Plus, FileCode2, Sparkles, History as HistoryIcon, FolderOpen, Eye, Pencil } from "lucide-react";
import { useAnon, type EditorFile } from "@/lib/store";

export function TabBar() {
  const s = useAnon();
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>((null));
  if (s.zenMode) return null;

  function startRename(f: EditorFile) {
    setRenaming({ id: f.id, draft: f.name });
  }
  function commitRename() {
    if (!renaming) return;
    s.renameFile(renaming.id, renaming.draft);
    setRenaming(null);
  }

  return (
    <div className="flex h-9 items-stretch hairline-b anon-raise overflow-x-auto no-scrollbar">
      <div className="flex items-stretch">
        {s.files.map((f) => {
          const active = f.id === s.activeFileId;
          const isRenaming = renaming?.id === f.id;
          return (
            <div
              key={f.id}
              className={`group flex h-9 items-center gap-1.5 px-3 text-xs anon-mono transition-colors ${
                active
                  ? "bg-[var(--anon-bg)] anon-fg hairline-r"
                  : "anon-mut hover:bg-[var(--anon-panel)] hairline-r"
              }`}
            >
              {isRenaming ? (
                <span className="flex items-center gap-2">
                  <FileCode2 className="h-3 w-3 anon-accent" />
                  <input
                    autoFocus
                    value={renaming!.draft}
                    maxLength={80}
                    spellCheck={false}
                    onChange={(e) => setRenaming({ id: f.id, draft: e.target.value })}
                    onBlur={commitRename}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      // shield the global shortcut handler while typing a name
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitRename();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setRenaming(null);
                      }
                    }}
                    title="Enter to save · Esc to cancel"
                    className="w-24 sm:w-28 border-b border-[var(--anon-accent)] bg-transparent anon-fg anon-mono text-xs outline-none"
                  />
                </span>
              ) : (
                <button
                  onClick={() => s.setActiveFile(f.id)}
                  onDoubleClick={() => startRename(f)}
                  className="flex items-center gap-2 cursor-pointer"
                  title="Double-click to rename"
                >
                  <FileCode2 className="h-3 w-3" />
                  <span className="whitespace-nowrap">{f.name}</span>
                  {active && (
                    <span className="h-1.5 w-1.5 rounded-full anim-beat" style={{ background: "var(--anon-ok)" }} />
                  )}
                </button>
              )}
              {!isRenaming && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(f);
                    }}
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:anon-accent transition-opacity cursor-pointer p-0.5"
                    title="Rename file"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  {s.files.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        s.removeFile(f.id);
                      }}
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-[var(--anon-danger)] ml-1 transition-opacity cursor-pointer p-0.5"
                      title="Close tab"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
        <button
          onClick={() => s.addFile("", "text")}
          className="flex h-9 w-9 items-center justify-center anon-mut hover:bg-[var(--anon-panel)] hairline-r cursor-pointer"
          title="New file (renames to untitled.txt — double-click the tab to rename)"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="ml-auto flex items-stretch">
        <HubTab icon={Eye} label="Preview" onClick={() => s.toggleMdPreview()} active={s.mdPreviewOpen} />
        <HubTab icon={Sparkles} label="Generative" onClick={() => s.toggleGenerative()} active={s.generativeOpen} />
        <HubTab icon={HistoryIcon} label="History" onClick={() => s.toggleHistory()} active={s.historyOpen} />
        <HubTab icon={FolderOpen} label="Files" onClick={() => s.toggleFiles()} active={s.filesOpen} />
      </div>
    </div>
  );
}

function HubTab({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-9 items-center gap-1.5 px-3 text-xs anon-mono hairline-l transition-colors ${
        active ? "bg-[var(--anon-panel)] anon-fg" : "anon-mut hover:bg-[var(--anon-panel)]"
      }`}
      title={label}
    >
      <Icon className="h-3 w-3" />
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}
