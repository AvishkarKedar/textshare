"use client";

import { useEffect, useRef, useState } from "react";
import { useAnon } from "@/lib/store";
import { initials } from "@/lib/themes";
import { ArrowDown, Sparkles } from "lucide-react";
import { SlashCommandPopup } from "@/components/palette/SlashCommandPopup";
import type { SlashCommand } from "@/lib/store";
import { tokenizeLine, TOKEN_COLORS } from "@/lib/highlight";
import { detectLanguage, langToExt } from "@/lib/detect";
import { toast } from "sonner";

function highlightLine(line: string, language: string) {
  const tokens = tokenizeLine(line, language);
  return tokens.map((t, i) => (
    <span key={i} style={{ color: TOKEN_COLORS[t.type] }}>
      {t.value}
    </span>
  ));
}

export function EditorStage() {
  const s = useAnon();
  const file = s.files.find((f) => f.id === s.activeFileId)!;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursorLine, setCursorLine] = useState(5);
  const [slashRect, setSlashRect] = useState<DOMRect | null>(null);
  const [slashQ, setSlashQ] = useState("");

  // derived: show placeholder only when file is empty
  const showPlaceholder = file.content.trim() === "";

  function openSlash(q: string) {
    setSlashQ(q);
    const ta = textareaRef.current;
    if (!ta) return;
    // compute caret coordinates
    const rect = ta.getBoundingClientRect();
    const upto = ta.value.substring(0, ta.selectionStart);
    const lines = upto.split("\n");
    const lineNum = lines.length;
    const col = lines[lines.length - 1].length;
    const lineHeight = 13 * 1.6;
    const charWidth = 7.6;
    setSlashRect(
      new DOMRect(
        rect.left + 48 + col * charWidth, // 48 = gutter width + padding
        rect.top + 12 + (lineNum - 1) * lineHeight,
        0,
        lineHeight,
      ),
    );
  }

  function handleSlashPick(cmd: SlashCommand) {
    // remove the /trigger text from the editor (everything from the slash to caret)
    const ta = textareaRef.current;
    if (ta) {
      const upto = ta.value.substring(0, ta.selectionStart);
      const slashIdx = upto.lastIndexOf("/");
      if (slashIdx >= 0) {
        const before = ta.value.substring(0, slashIdx);
        const after = ta.value.substring(ta.selectionStart);
        s.updateFileContent(file.id, before + after);
        // restore caret
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = before.length;
          ta.focus();
        });
      }
    }
    setSlashRect(null);
    setSlashQ("");

    // execute command
    switch (cmd.id) {
      case "run":
        s.runCode();
        break;
      case "test":
        s.runTests();
        break;
      case "generative":
        s.toggleGenerative();
        break;
      case "snap":
        s.toggleHistory();
        setTimeout(() => {
          const label = prompt("Name this snapshot:", "v2 — after refactor");
          if (label && label.trim()) {
            s.addSnapshot(label);
            toast.success("Snapshot bookmarked", { description: label.trim() });
          }
        }, 250);
        break;
      case "browser":
        s.toggleBrowser();
        break;
      case "voice":
        s.toggleVoice();
        break;
      case "files":
        s.toggleFiles();
        break;
      case "rooms":
        s.toggleBookmarks();
        break;
      case "status":
        s.toggleStatus();
        break;
      case "security":
        s.toggleSecurity();
        break;
      case "faq":
        s.toggleFaq();
        break;
      case "find":
        s.toggleFind();
        break;
      case "syntax":
        s.toggleSyntaxHighlight();
        toast.success(s.syntaxHighlight ? "Syntax highlighting off" : "Syntax highlighting on");
        break;
      case "tour":
        s.startTour();
        break;
      case "crypto":
        s.toggleCrypto();
        break;
      case "export":
        s.exportProjectZip();
        toast.success("Exporting project ZIP", { description: `${s.files.length} files` });
        break;
      case "zen":
        s.toggleZen();
        break;
      case "clear":
        if (confirm("Clear the active file?")) {
          s.updateFileContent(file.id, "");
          toast.success("Editor cleared");
        }
        break;
      case "goal":
        {
          const text = prompt("Set a session goal:", "ship the deriveKey split by EOD");
          if (text && text.trim()) {
            s.setGoal(text);
            toast.success("Goal pinned", { description: text.trim() });
          }
        }
        break;
      case "whiteboard":
        s.toggleWhiteboard();
        break;
      case "history":
        s.toggleHistory();
        break;
      case "help":
        s.toggleShortcuts();
        break;
      case "shrug":
        s.addMessage({
          authorId: "me",
          authorName: s.displayName || "you",
          color: s.color,
          body: "¯\\_(ツ)_/¯",
          pinned: false,
          codeBlock: null,
          threadParent: null,
        });
        toast.success("¯\\_(ツ)_/¯ sent to chat");
        break;
      case "share":
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(window.location.href);
          toast.success("Share link copied");
        }
        break;
      default:
        toast(`${cmd.trigger} — ${cmd.label}`, { description: cmd.hint });
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    s.updateFileContent(file.id, val);
    // broadcast edit to sync service
    try {
      const sock = (window as unknown as { __anonSocket?: { emit: (ev: string, data: unknown) => void } }).__anonSocket;
      sock?.emit("edit", { fileId: file.id, content: val });
    } catch { /* offline ok */ }
    // detect slash command: a "/" at start of a line or after whitespace
    const ta = e.target;
    const upto = ta.value.substring(0, ta.selectionStart);
    const lineStart = upto.lastIndexOf("\n") + 1;
    const lineText = upto.substring(lineStart);
    const slashMatch = lineText.match(/(?:^|\s)(\/(\w*))$/);
    if (slashMatch) {
      openSlash(slashMatch[2]);
    } else {
      if (slashRect) {
        setSlashRect(null);
        setSlashQ("");
      }
    }
  }

  function handleSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    const upto = ta.value.substring(0, ta.selectionStart);
    const line = upto.split("\n").length;
    setCursorLine(line);
    // broadcast cursor to sync service
    try {
      const sock = (window as unknown as { __anonSocket?: { emit: (ev: string, data: unknown) => void } }).__anonSocket;
      sock?.emit("cursor", { line });
    } catch { /* offline ok */ }
    // close slash popup on selection change if not actively typing a command
    const lineStart = upto.lastIndexOf("\n") + 1;
    const lineText = upto.substring(lineStart);
    if (!lineText.match(/(?:^|\s)\/\w*$/)) {
      setSlashRect(null);
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 bg-[var(--anon-bg)]">
      {/* editor area */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          {/* gutter */}
          <div className="anon-mono w-12 flex-none select-none hairline-r bg-[var(--anon-raise)] px-2 py-3 text-right text-[11px] anon-dim anon-scroll overflow-y-auto">
            {(file.content || "// start typing").split("\n").map((_, i) => (
              <div key={i} className={`leading-[1.6] ${i + 1 === cursorLine ? "anon-fg" : ""}`}>
                {i + 1}
              </div>
            ))}
          </div>

          {/* text editor */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {/* syntax-highlighted overlay (under the transparent textarea) */}
            {s.syntaxHighlight && !showPlaceholder && (
              <div
                aria-hidden
                className="anon-mono pointer-events-none absolute inset-0 overflow-hidden p-3 text-[13px] leading-[1.6]"
                style={{ fontFamily: "var(--anon-mono)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                {file.content.split("\n").map((line, i) => (
                  <div key={i} className="min-h-[1.6em]">
                    {highlightLine(line, file.language)}
                    {"\n"}
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={file.content}
              onChange={handleChange}
              onSelect={handleSelect}
              onKeyUp={handleSelect}
              onClick={handleSelect}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                if (pasted && pasted.length > 20) {
                  const detected = detectLanguage(pasted);
                  if (detected.confidence > 0.6 && detected.language !== file.language && detected.language !== "text") {
                    const ext = langToExt(detected.language);
                    const newName = file.name.replace(/\.[^.]+$/, `.${ext}`);
                    toast(`Detected ${detected.label}`, {
                      description: `Switch file to .${ext}?`,
                      action: {
                        label: "switch",
                        onClick: () => {
                          s.updateFileContent(file.id, pasted);
                          // rename the file
                          useAnon.setState((st) => ({
                            files: st.files.map((f) => f.id === file.id ? { ...f, name: newName, language: detected.language } : f),
                          }));
                          toast.success(`Switched to ${detected.label}`);
                        },
                      },
                      duration: 6000,
                    });
                  }
                }
              }}
              spellCheck={false}
              className={`anon-mono anon-scroll relative h-full w-full flex-1 resize-none bg-transparent p-3 text-[13px] leading-[1.6] outline-none ${s.syntaxHighlight ? "text-transparent caret-[var(--anon-fg)]" : "text-[var(--anon-fg)]"}`}
              style={{ fontFamily: "var(--anon-mono)" }}
            />
            {/* empty-state placeholder overlay */}
            {showPlaceholder && (
              <div className="pointer-events-none absolute inset-0 px-3 py-3">
                <div className="anon-mono text-[13px] leading-[1.6] anon-dim">
                  <div>{"// You're live. Share "}{s.roomCode || "ABC123"}{" with someone."}</div>
                  <div>{"// Everything here is encrypted. Try typing "}<span className="anon-accent">/</span>{" for slash commands."}</div>
                  <div className="mt-2 inline-flex items-center gap-1 anon-mut">
                    <Sparkles className="h-3 w-3" /> press ⌘K for the command palette
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* "edits below" jump pill */}
        <button
          className="anon-mono absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 hairline anon-panel px-2 py-1 text-[10px] anon-mut hover:anon-fg"
          title="Jump to latest edit"
        >
          <ArrowDown className="h-3 w-3" /> edits below
        </button>
      </div>

      {/* presence strip (right gutter) */}
      <PresenceStrip />

      {/* slash-commands popup */}
      {slashRect && (
        <SlashCommandPopup
          anchorRect={slashRect}
          onPick={handleSlashPick}
          onClose={() => {
            setSlashRect(null);
            setSlashQ("");
          }}
        />
      )}
      {/* keep slashQ referenced so the filter hook works if needed later */}
      <span className="sr-only">{slashQ}</span>
    </div>
  );
}

function PresenceStrip() {
  const s = useAnon();
  if (s.zenMode) return null;
  return (
    <aside className="hidden w-44 flex-none hairline-l bg-[var(--anon-raise)] lg:flex lg:flex-col">
      <div className="anon-mono hairline-b px-3 py-2 text-[10px] uppercase tracking-wider anon-dim">
        online · {s.participants.filter((p) => p.online).length}
      </div>
      <div className="flex-1 overflow-y-auto anon-scroll">
        {s.participants.map((p) => (
          <button
            key={p.id}
            className="group flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--anon-panel)]"
            title={`Jump to ${p.name}'s cursor`}
          >
            <span
              className="anon-mono relative inline-flex h-6 w-6 flex-none items-center justify-center text-[10px] font-semibold text-black"
              style={{ background: p.color }}
            >
              {initials(p.name)}
              {p.online && (
                <span
                  className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--anon-ok)" }}
                />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="anon-mono truncate text-[11px] anon-fg">
                {p.name}
                {p.isOwner && <span className="ml-1 anon-warn">★</span>}
              </div>
              <div className="anon-mono text-[10px] anon-dim">
                {p.online ? `line ${p.cursorLine ?? "—"}` : "offline"}
              </div>
            </div>
          </button>
        ))}
      </div>
      <div className="anon-mono hairline-t px-3 py-2 text-[10px] anon-dim">
        voice: <span style={{ color: "var(--anon-ok)" }}>●</span> connected
      </div>
    </aside>
  );
}
