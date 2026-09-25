"use client";

import { X, Plus, FileCode2, Sparkles, History as HistoryIcon, FolderOpen, Eye } from "lucide-react";
import { useAnon } from "@/lib/store";

export function TabBar() {
  const s = useAnon();
  if (s.zenMode) return null;

  return (
    <div className="flex h-9 items-stretch hairline-b anon-raise overflow-x-auto no-scrollbar">
      <div className="flex items-stretch">
        {s.files.map((f) => {
          const active = f.id === s.activeFileId;
          return (
            <div
              key={f.id}
              className={`group flex h-9 items-center gap-1.5 px-3 text-xs anon-mono transition-colors ${
                active
                  ? "bg-[var(--anon-bg)] anon-fg hairline-r"
                  : "anon-mut hover:bg-[var(--anon-panel)] hairline-r"
              }`}
            >
              <button
                onClick={() => s.setActiveFile(f.id)}
                className="flex items-center gap-2 cursor-pointer"
              >
                <FileCode2 className="h-3 w-3" />
                <span className="whitespace-nowrap">{f.name}</span>
                {active && (
                  <span className="h-1.5 w-1.5 rounded-full anim-beat" style={{ background: "var(--anon-ok)" }} />
                )}
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
            </div>
          );
        })}
        <button
          onClick={() => s.addFile("untitled.txt", "text")}
          className="flex h-9 w-9 items-center justify-center anon-mut hover:bg-[var(--anon-panel)] hairline-r cursor-pointer"
          title="New file"
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
