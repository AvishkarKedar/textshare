"use client";

import { useEffect, useRef, useState } from "react";
import { useAnon } from "@/lib/store";
import { initials } from "@/lib/themes";
import { Sparkles } from "lucide-react";
import { SlashCommandPopup } from "@/components/palette/SlashCommandPopup";
import type { SlashCommand } from "@/lib/store";
import { tokenizeLine, TOKEN_COLORS } from "@/lib/highlight";
import { detectLanguage, langToExt } from "@/lib/detect";
import { sendCursor, setTyping } from "@/lib/session";
import { toast } from "sonner";

function highlightLine(line: string, language: string) {
  const tokens = tokenizeLine(line, language);
  return tokens.map((t, i) => (
    <span key={i} style={{ color: TOKEN_COLORS[t.type] }}>
      {t.value}
    </span>
  ));
}

/* ------------------------------------------- editor keyboard intelligence */

const INDENT = "  ";
const OPEN_PAIR: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
const CLOSE_CHARS = new Set([")", "]", "}", '"', "'", "`"]);

/** Line-comment token per language; null = no line comments. */
function commentToken(language: string): string | null {
  switch ((language || "").toLowerCase()) {
    case "python": case "ruby": case "bash": case "sh": case "yaml": case "yml": case "toml":
      return "#";
    case "javascript": case "typescript": case "java": case "go": case "rust":
    case "c": case "cpp": case "c++": case "swift": case "kotlin": case "php": case "dart":
      return "//";
    case "sql": case "lua":
      return "--";
    default:
      return null;
  }
}

export function EditorStage() {
  const s = useAnon();
  const file = s.files.find((f) => f.id === s.activeFileId) || s.files[0] || { id: "f1", name: "main.js", language: "javascript", content: "" };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [cursorLine, setCursorLine] = useState(5);
  const [slashRect, setSlashRect] = useState<DOMRect | null>(null);
  const [slashQ, setSlashQ] = useState("");

  // Coarse-pointer (touch) detection — the editor font must be ≥ 16px there
  // or iOS Safari auto-zooms the page on every focus. Respects the user's
  // fontSize setting from Settings (12–18px) on pointer devices.
  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const update = () => setCoarsePointer(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const editorFont = Math.max(s.fontSize, coarsePointer ? 16 : 0);

  // remote cursors mapped onto line numbers — shown as colored line numbers
  // in the gutter plus a name tag ("who is where" at a glance).
  const remoteCursors = s.participants.filter(
    (p) => p.id !== "me" && p.online !== false && typeof p.cursorLine === "number",
  );
  const cursorByLine = new Map<number, typeof remoteCursors[number][]>();
  for (const p of remoteCursors) {
    const line = p.cursorLine as number;
    const arr = cursorByLine.get(line) || [];
    arr.push(p);
    cursorByLine.set(line, arr);
  }

  // derived: show placeholder only when file is empty
  const showPlaceholder = (file?.content || "").trim() === "";

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
      case "files":
        s.toggleFiles();
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
    // updateFileContent routes through the E2EE Yjs doc when a session is
    // live (encrypted delta → relay → peers); local-only otherwise.
    s.updateFileContent(file.id, val);
    // broadcast "typing…" to the room over encrypted awareness
    setTyping("editor");
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
    const lines = upto.split("\n");
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    setCursorLine(line);
    s.setCursorPos({ line, col, sel: Math.abs(ta.selectionEnd - ta.selectionStart) });
    // broadcast cursor via encrypted awareness presence
    sendCursor(line);
    // close slash popup on selection change if not actively typing a command
    const lineStart = upto.lastIndexOf("\n") + 1;
    const lineText = upto.substring(lineStart);
    if (!lineText.match(/(?:^|\s)\/\w*$/)) {
      setSlashRect(null);
    }
  }

  /** Apply a programmatic edit through the store (E2EE Yjs sync when live)
   *  and restore the caret/selection after React re-renders the new value. */
  function applyEdit(next: string, selStart: number, selEnd: number) {
    s.updateFileContent(file.id, next);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.setSelectionRange(selStart, selEnd);
      ta.focus();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // while the slash-command popup is open its own window handler owns the keys
    if (slashRect) return;
    const mod = e.metaKey || e.ctrlKey;
    const ta = e.currentTarget;
    const v = ta.value;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    /* --- ⌘/ toggle line comment --- */
    if (mod && e.key === "/") {
      e.preventDefault();
      const tok = commentToken(file.language);
      if (!tok) {
        toast(`No line comments for ${file.language}`);
        return;
      }
      const lineStart = v.lastIndexOf("\n", start - 1) + 1;
      let lineEnd = v.indexOf("\n", end);
      if (lineEnd === -1) lineEnd = v.length;
      const lines = v.slice(lineStart, lineEnd).split("\n");
      const nonEmpty = lines.filter((l) => l.trim());
      const allCommented = nonEmpty.length > 0 && nonEmpty.every((l) => l.trimStart().startsWith(tok));
      const lineStarts: number[] = [];
      let acc = lineStart;
      const newLines = lines.map((l) => {
        lineStarts.push(acc);
        acc += l.length + 1;
        if (!l.trim()) return l;
        if (allCommented) {
          const m = l.match(new RegExp("^(\\s*)" + tok.replace(/[/#-]/g, "\\$&") + " ?"));
          return m ? l.slice(m[0].length) : l;
        }
        const ind = l.match(/^\s*/)?.[0] ?? "";
        return ind + tok + " " + l.slice(ind.length);
      });
      const deltas = lines.map((l, i) => newLines[i].length - l.length);
      const mapPos = (pos: number) => {
        let d = 0;
        for (let i = 0; i < lineStarts.length; i++) {
          if (pos <= lineStarts[i]) break;
          d += deltas[i];
        }
        return Math.max(0, pos + d);
      };
      applyEdit(v.slice(0, lineStart) + newLines.join("\n") + v.slice(lineEnd), mapPos(start), mapPos(end));
      return;
    }

    /* --- ⌘D duplicate line --- */
    if (mod && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      const lineStart = v.lastIndexOf("\n", start - 1) + 1;
      let lineEnd = v.indexOf("\n", end);
      if (lineEnd === -1) lineEnd = v.length;
      const block = v.slice(lineStart, lineEnd);
      const caretOff = start - lineStart;
      const selOff = end - lineStart;
      applyEdit(v.slice(0, lineEnd) + "\n" + block + v.slice(lineEnd), lineEnd + 1 + caretOff, lineEnd + 1 + selOff);
      return;
    }

    /* --- Tab / Shift+Tab: indent / outdent (never steal focus) --- */
    if (e.key === "Tab" && !mod && !e.altKey) {
      e.preventDefault();
      if (start === end && !e.shiftKey) {
        applyEdit(v.slice(0, start) + INDENT + v.slice(start), start + INDENT.length, start + INDENT.length);
        return;
      }
      const lineStart = v.lastIndexOf("\n", start - 1) + 1;
      let lineEnd = v.indexOf("\n", end);
      if (lineEnd === -1) lineEnd = v.length;
      const lines = v.slice(lineStart, lineEnd).split("\n");
      if (e.shiftKey) {
        const stripped = lines.map((l) =>
          l.startsWith(INDENT) ? l.slice(INDENT.length) : l.startsWith("\t") ? l.slice(1) : l,
        );
        const removed = lines.reduce((n, l, i) => n + (l.length - stripped[i].length), 0);
        const removedBefore = lines.reduce((n, l, i) => {
          const ls = i === 0 ? start - lineStart : 0;
          return n + (ls >= l.length ? l.length - stripped[i].length : 0);
        }, 0);
        applyEdit(
          v.slice(0, lineStart) + stripped.join("\n") + v.slice(lineEnd),
          Math.max(lineStart, start - removedBefore),
          Math.max(lineStart, end - removed),
        );
      } else {
        applyEdit(
          v.slice(0, lineStart) + lines.map((l) => INDENT + l).join("\n") + v.slice(lineEnd),
          start + INDENT.length,
          end + INDENT.length * lines.length,
        );
      }
      return;
    }

    /* --- Enter: auto-indent (preserve indentation, deepen after openers) --- */
    if (e.key === "Enter" && !mod && !e.shiftKey && !e.altKey && !e.nativeEvent.isComposing) {
      if (start !== end) return; // default Enter replaces the selection
      const lineStart = v.lastIndexOf("\n", start - 1) + 1;
      const indent = v.slice(lineStart, start).match(/^[ \t]*/)?.[0] ?? "";
      const prev = v[start - 1] ?? "";
      const next = v[start] ?? "";
      const opener = prev === "{" || prev === "(" || prev === "[";
      const closerAhead = next === "}" || next === ")" || next === "]";
      if (opener) {
        if (closerAhead) {
          // caret between { and }: {
          //                       |caret|
          //                       }
          const insert = "\n" + indent + INDENT + "\n" + indent;
          applyEdit(v.slice(0, start) + insert + v.slice(start), start + 1 + indent.length + INDENT.length, start + 1 + indent.length + INDENT.length);
        } else {
          applyEdit(v.slice(0, start) + "\n" + indent + INDENT + v.slice(start), start + 1 + indent.length + INDENT.length, start + 1 + indent.length + INDENT.length);
        }
        e.preventDefault();
        return;
      }
      if (indent) {
        applyEdit(v.slice(0, start) + "\n" + indent + v.slice(start), start + 1 + indent.length, start + 1 + indent.length);
        e.preventDefault();
      }
      return; // no indent to preserve → default Enter
    }

    /* --- auto-close pairs / skip over closers / wrap selection --- */
    if (!mod && !e.altKey && !e.nativeEvent.isComposing && OPEN_PAIR[e.key] && start === end) {
      const closer = OPEN_PAIR[e.key];
      e.preventDefault();
      applyEdit(v.slice(0, start) + e.key + closer + v.slice(start), start + 1, start + 1);
      return;
    }
    if (!mod && !e.altKey && OPEN_PAIR[e.key] && start !== end) {
      e.preventDefault();
      const sel = v.slice(start, end);
      applyEdit(v.slice(0, start) + e.key + sel + OPEN_PAIR[e.key] + v.slice(end), start + 1, end + 1);
      return;
    }
    if (!mod && CLOSE_CHARS.has(e.key) && start === end && v[start] === e.key) {
      e.preventDefault();
      applyEdit(v, start + 1, start + 1); // just skip over the existing closer
      return;
    }

    /* --- Backspace between an empty pair deletes both --- */
    if (e.key === "Backspace" && !mod && !e.altKey && start === end && start > 0) {
      const before = v[start - 1];
      const after = v[start];
      if (before && after && OPEN_PAIR[before] === after && before === after) {
        // quotes only — brackets have distinct open/close chars
        e.preventDefault();
        applyEdit(v.slice(0, start - 1) + v.slice(start + 1), start - 1, start - 1);
      }
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 bg-[var(--anon-bg)]">
      {/* editor area — the font size token drives gutter, overlay and
          textarea together so every line stays perfectly aligned */}
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        style={{ "--anon-edfont": `${editorFont}px` } as React.CSSProperties}
      >
        <div className="flex min-h-0 flex-1">
          {/* gutter — remote cursors shown in the peer's color */}
          <div
            ref={gutterRef}
            className="anon-mono w-12 flex-none select-none hairline-r bg-[var(--anon-raise)] px-2 py-3 text-right text-[length:var(--anon-edfont)] anon-dim anon-scroll overflow-y-auto"
          >
            {(file.content || "// start typing").split("\n").map((_, i) => {
              const line = i + 1;
              const here = cursorByLine.get(line);
              const isMine = line === cursorLine;
              return (
                <div
                  key={i}
                  className="group/g relative flex items-center justify-end gap-0.5 leading-[1.6]"
                >
                  {here && here.length > 0 && (
                    <span
                      className="pointer-events-none absolute right-full z-10 mr-1 whitespace-nowrap px-1 text-[9px] font-semibold text-black opacity-0 transition-opacity group-hover/g:opacity-100"
                      style={{ background: here[0].color }}
                      title={here.map((p) => p.name).join(", ")}
                    >
                      {here[0].name}{here.length > 1 ? ` +${here.length - 1}` : ""}
                    </span>
                  )}
                  <span
                    className={isMine ? "anon-fg" : ""}
                    style={
                      here && here.length > 0 && !isMine
                        ? { color: here[0].color, fontWeight: 700 }
                        : undefined
                    }
                  >
                    {line}
                  </span>
                </div>
              );
            })}
          </div>

          {/* text editor */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {/* syntax-highlighted overlay (under the transparent textarea) */}
            {s.syntaxHighlight && !showPlaceholder && (
              <div
                aria-hidden
                className="anon-mono pointer-events-none absolute inset-0 overflow-hidden p-3 text-[length:var(--anon-edfont)] leading-[1.6]"
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
              onKeyDown={handleKeyDown}
              onScroll={(e) => {
                // keep line numbers glued to the code while scrolling
                if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
              }}
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
              className={`anon-mono anon-scroll ed-font relative h-full w-full flex-1 resize-none bg-transparent p-3 text-[length:var(--anon-edfont)] leading-[1.6] outline-none ${s.syntaxHighlight ? "text-transparent caret-[var(--anon-fg)]" : "text-[var(--anon-fg)]"}`}
              style={{ fontFamily: "var(--anon-mono)" }}
            />
            {/* empty-state placeholder overlay */}
            {showPlaceholder && (
              <div className="pointer-events-none absolute inset-0 px-3 py-3">
                <div className="anon-mono text-[length:var(--anon-edfont)] leading-[1.6] anon-dim">
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
  const online = s.participants.filter((p) => p.online);
  const typing = online.filter((p) => p.typing && p.id !== "me");
  const syncLabel =
    s.syncState === "synced" ? "live" :
    s.syncState === "connected" ? "connected" :
    s.syncState === "connecting" ? "connecting…" :
    s.syncState === "retrying" ? "reconnecting…" :
    s.roomCode ? "offline" : "—";
  return (
    <aside className="hidden w-44 flex-none hairline-l bg-[var(--anon-raise)] lg:flex lg:flex-col">
      <div className="anon-mono hairline-b px-3 py-2 text-[10px] uppercase tracking-wider anon-dim">
        online · {online.length}
      </div>
      <div className="flex-1 overflow-y-auto anon-scroll">
        {s.participants.map((p) => (
          <div
            key={p.id}
            className="group flex w-full items-center gap-2 px-3 py-2 text-left"
            title={p.typing ? `${p.name} is typing…` : `Jump to ${p.name}'s cursor`}
          >
            <span
              className={`anon-mono relative inline-flex h-6 w-6 flex-none items-center justify-center text-[10px] font-semibold text-black ${p.typing ? "anim-pulse-ring" : ""}`}
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
              <div className="anon-mono text-[10px]">
                {p.typing ? (
                  <span style={{ color: "var(--anon-ok)" }}>typing…</span>
                ) : (
                  <span className="anon-dim">
                    {p.online ? `line ${p.cursorLine ?? "—"}` : "offline"}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* live typing ticker */}
      {typing.length > 0 && (
        <div className="anon-mono hairline-t px-3 py-2 text-[10px]" style={{ color: "var(--anon-ok)" }}>
          {typing.length === 1
            ? `${typing[0].name} is typing`
            : typing.length === 2
              ? `${typing[0].name} & ${typing[1].name} are typing`
              : `${typing.length} people are typing`}
          <span className="anim-beat"> …</span>
        </div>
      )}
      <div className="anon-mono hairline-t px-3 py-2 text-[10px] anon-dim">
        sync: <span style={{ color: s.syncState === "synced" || s.syncState === "connected" ? "var(--anon-ok)" : "var(--anon-warn)" }}>●</span> {syncLabel}
      </div>
    </aside>
  );
}
