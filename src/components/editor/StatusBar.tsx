"use client";

import { useState, useRef, useEffect } from "react";
import {
  Wifi,
  WifiOff,
  Lock,
  Eye,
  Radio,
  HelpCircle,
  ShieldCheck,
  Timer,
  CornerDownLeft,
  ChevronUp,
  Code2,
  Check,
} from "lucide-react";
import { useAnon } from "@/lib/store";
import type { ConnState } from "@/lib/relay";

const SUPPORTED_LANGUAGES = [
  { id: "python", label: "Python", ext: "py" },
  { id: "javascript", label: "JavaScript", ext: "js" },
  { id: "typescript", label: "TypeScript", ext: "ts" },
  { id: "c", label: "C", ext: "c" },
  { id: "cpp", label: "C++", ext: "cpp" },
  { id: "java", label: "Java", ext: "java" },
  { id: "rust", label: "Rust", ext: "rs" },
  { id: "go", label: "Go", ext: "go" },
  { id: "bash", label: "Bash", ext: "sh" },
  { id: "html", label: "HTML", ext: "html" },
  { id: "css", label: "CSS", ext: "css" },
  { id: "json", label: "JSON", ext: "json" },
  { id: "markdown", label: "Markdown", ext: "md" },
  { id: "sql", label: "SQL", ext: "sql" },
  { id: "text", label: "Plain Text", ext: "txt" },
];

function connInfo(state: ConnState): { label: string; color: string; title: string } {
  switch (state) {
    case "synced":
      return { label: "synced", color: "var(--anon-ok)", title: "Connected to the relay — full history synced" };
    case "connected":
      return { label: "connected", color: "var(--anon-ok)", title: "Connected to the relay — syncing" };
    case "connecting":
      return { label: "connecting…", color: "var(--anon-warn)", title: "Establishing the encrypted relay connection" };
    case "retrying":
      return { label: "reconnecting…", color: "var(--anon-warn)", title: "Relay unreachable — retrying with backoff" };
    default:
      return { label: "offline", color: "var(--anon-danger)", title: "Not connected — local-only until the relay answers" };
  }
}

function fmtTtl(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function StatusBar() {
  const s = useAnon();
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  const online = s.participants.filter((p) => p.online).length;
  const conn = connInfo(s.syncState);
  const e2e = s.syncState === "connected" || s.syncState === "synced";
  const activeFile = s.files.find((f) => f.id === s.activeFileId) || s.files[0];
  const stdinLines = s.stdin.trim() ? s.stdin.split("\n").length : 0;

  // Close language picker on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangPickerOpen(false);
      }
    }
    if (langPickerOpen) {
      window.addEventListener("mousedown", handleClickOutside);
      return () => window.removeEventListener("mousedown", handleClickOutside);
    }
  }, [langPickerOpen]);

  // Room TTL reported live by the relay in the room-state frame.
  const ttlMs = s.roomState?.ttl ?? null;
  const ttlLabel = ttlMs != null ? fmtTtl(ttlMs) : s.ttl;

  function selectLanguage(langId: string, ext: string) {
    if (!activeFile) return;
    const baseName = activeFile.name.replace(/\.[^/.]+$/, "");
    const newName = `${baseName}.${ext}`;
    s.setFileLanguage(activeFile.id, langId, newName);
    setLangPickerOpen(false);
  }

  return (
    <footer className="relative flex h-7 items-center gap-3 hairline-t anon-raise px-3 anon-mono text-[10px] anon-mut select-none">
      <button
        onClick={() => s.toggleStatus()}
        className="inline-flex items-center gap-1.5 hover:text-[var(--anon-fg)] cursor-pointer transition-colors"
        title={conn.title}
      >
        <span className="h-1.5 w-1.5 rounded-full anim-beat" style={{ background: conn.color }} />
        {s.syncState === "retrying" || s.syncState === "dead" ? (
          <WifiOff className="h-3 w-3" />
        ) : (
          <Wifi className="h-3 w-3" />
        )}{" "}
        {conn.label}
      </button>

      <span className="inline-flex items-center gap-1.5">
        <Radio className="h-3 w-3" /> {online} online
        {s.roomState && s.roomState.peers > 0 && (
          <span className="anon-dim">({s.roomState.peers} relay)</span>
        )}
      </span>

      <button
        onClick={() => s.toggleSecurity()}
        className="inline-flex items-center gap-1 hover:brightness-125 cursor-pointer transition-colors"
        style={{ color: e2e ? "var(--anon-ok)" : "var(--anon-mut)" }}
        title={e2e ? "Zero-knowledge E2E encryption active (AES-GCM-256)" : "Encryption active once the relay link is up"}
      >
        <Lock className="h-3 w-3" /> e2e
      </button>

      {s.roomState?.locked && (
        <span className="inline-flex items-center gap-1 cursor-pointer" style={{ color: "var(--anon-warn)" }} title="Room locked by the owner — read-only">
          <ShieldCheck className="h-3 w-3" /> read-only
        </span>
      )}

      {!s.canEdit && !s.roomState?.locked && (
        <span className="inline-flex items-center gap-1" style={{ color: "var(--anon-warn)" }} title="The owner has not granted you edit rights">
          <Eye className="h-3 w-3" /> viewer
        </span>
      )}

      <button
        onClick={() => s.toggleFaq()}
        className="inline-flex items-center gap-1 hover:text-[var(--anon-accent)] cursor-pointer transition-colors"
        title="Open FAQs & Help (⌘⇧F)"
      >
        <HelpCircle className="h-3 w-3" /> FAQ
      </button>

      {/* stdin readiness — one glance tells you whether the next Run takes input */}
      {stdinLines > 0 && (
        <button
          onClick={() => {
            s.setStdinOpen(true);
            if (!s.terminalOpen) s.toggleTerminal();
          }}
          className="inline-flex items-center gap-1 cursor-pointer transition-colors"
          style={{ color: "var(--anon-accent)" }}
          title={`${stdinLines} line${stdinLines === 1 ? "" : "s"} of program input ready — piped as stdin on Run`}
        >
          <CornerDownLeft className="h-3 w-3" /> in:{stdinLines}
        </button>
      )}

      {s.zenMode && (
        <button
          onClick={() => s.toggleZen()}
          className="inline-flex items-center gap-1 cursor-pointer"
          style={{ color: "var(--anon-warn)" }}
          title="Exit zen mode (⌘.)"
        >
          <Eye className="h-3 w-3" /> zen
        </button>
      )}

      <div className="ml-auto flex items-center gap-3">
        {/* Language selector popover */}
        {activeFile && (
          <div ref={langRef} className="relative inline-block">
            <button
              onClick={() => setLangPickerOpen(!langPickerOpen)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[var(--anon-panel)] anon-fg cursor-pointer transition-colors"
              title="Click to change programming language / compiler"
            >
              <Code2 className="h-3 w-3 anon-accent" />
              <span>{activeFile.language || "text"}</span>
              <ChevronUp className="h-2.5 w-2.5 anon-dim" />
            </button>

            {langPickerOpen && (
              <div className="absolute bottom-full right-0 mb-1 w-44 rounded-lg bg-[var(--anon-raise)] p-1 shadow-xl hairline-all z-50 animate-in fade-in zoom-in-95">
                <div className="px-2 py-1 text-[9px] font-semibold tracking-wider uppercase anon-dim border-b border-[var(--anon-edge)]">
                  Select Language
                </div>
                <div className="max-h-56 overflow-y-auto py-1">
                  {SUPPORTED_LANGUAGES.map((item) => {
                    const selected =
                      (activeFile.language || "").toLowerCase() === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => selectLanguage(item.id, item.ext)}
                        className={`w-full flex items-center justify-between px-2 py-1 text-left text-[11px] rounded transition-colors cursor-pointer ${
                          selected
                            ? "bg-[var(--anon-panel)] anon-accent font-medium"
                            : "anon-fg hover:bg-[var(--anon-panel)]"
                        }`}
                      >
                        <span>{item.label}</span>
                        {selected && <Check className="h-3 w-3 anon-accent" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <span className="hidden sm:inline items-center gap-1">
          {s.roomCode || "------"}
          <span className="anon-dim"> · <Timer className="inline h-3 w-3 align-[-2px]" /> {ttlLabel} left</span>
        </span>
        <span className="hidden md:inline">utf-8</span>
        <span className="hidden md:inline">{s.keybindings}</span>
        <span title="Live caret position (updates as you move)">
          ln {s.cursorPos.line}, col {s.cursorPos.col}
          {s.cursorPos.sel > 0 && (
            <span className="anon-accent"> · {s.cursorPos.sel} selected</span>
          )}
        </span>
      </div>
    </footer>
  );
}
