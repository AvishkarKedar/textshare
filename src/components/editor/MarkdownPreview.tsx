"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useAnon } from "@/lib/store";
import {
  X,
  Eye,
  Monitor,
  Tablet,
  Smartphone,
  RotateCcw,
  ExternalLink,
  Code2,
  Terminal,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";

/**
 * Very small markdown → HTML renderer. Supports:
 * - # / ## / ### headings
 * - **bold**, *italic*, `code`
 * - - / * bullet lists, 1. numbered lists
 * - [text](url) links
 * - > blockquotes
 * - --- hr
 * - ``` code blocks ```
 * - [ ] / [x] checkboxes (read-only)
 * - paragraphs + line breaks
 * Enough for previewing README.md / notes. ~80 lines, no deps.
 */
function safeHref(u: string): string {
  const s = u.replace(/"/g, "%22").replace(/'/g, "%27").replace(/</g, "%3C").trim();
  if (/^(https?:|mailto:|\/|#|\.\/)/i.test(s)) return s;
  return "#";
}

function renderMarkdown(src: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(
        /\[([^\]]+)\]\(([^)\s]+)\)/g,
        (_m: string, text: string, href: string) =>
          `<a href="${safeHref(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`,
      );

  const lines = src.split("\n");
  const out: string[] = [];
  let inCode = false;
  let inUl = false;
  let inOl = false;
  let para: string[] = [];

  function flushPara() {
    if (para.length > 0) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  }
  function closeLists() {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  }

  for (const raw of lines) {
    const line = raw;
    // code fence
    if (line.trim().startsWith("```")) {
      if (inCode) {
        out.push("</code></pre>");
        inCode = false;
      } else {
        flushPara();
        closeLists();
        out.push("<pre><code>");
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      out.push(esc(line));
      continue;
    }
    // hr
    if (/^---+\s*$/.test(line)) {
      flushPara();
      closeLists();
      out.push("<hr />");
      continue;
    }
    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      closeLists();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    // blockquote
    if (line.startsWith("> ")) {
      flushPara();
      closeLists();
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
      continue;
    }
    // checkbox
    const cb = line.match(/^\s*[-*]\s+\[([ x])\]\s+(.*)$/);
    if (cb) {
      flushPara();
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      const checked = cb[1] === "x";
      out.push(
        `<li class="cb"><span class="box ${checked ? "on" : ""}">${checked ? "✓" : ""}</span> ${inline(cb[2])}</li>`,
      );
      continue;
    }
    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`);
      continue;
    }
    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${inline(line.replace(/^\s*\d+\.\s+/, ""))}</li>`);
      continue;
    }
    // blank line = paragraph break
    if (line.trim() === "") {
      flushPara();
      closeLists();
      continue;
    }
    // accumulate paragraph
    para.push(line);
  }
  flushPara();
  closeLists();
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

interface FrameLog {
  id: string;
  kind: "log" | "warn" | "error" | "info";
  message: string;
  ts: number;
}

export function MarkdownPreview() {
  const s = useAnon();
  const file = s.files.find((f) => f.id === s.activeFileId) || s.files[0];
  const [deviceMode, setDeviceMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [refreshKey, setRefreshKey] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [logs, setLogs] = useState<FrameLog[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const lang = (file?.language || "").toLowerCase();
  const fileName = (file?.name || "").toLowerCase();

  const isMd = lang === "markdown" || fileName.endsWith(".md");
  const isHtml = lang === "html" || lang === "htm" || fileName.endsWith(".html") || fileName.endsWith(".htm") || fileName.endsWith(".xhtml");
  const isSvg = lang === "svg" || fileName.endsWith(".svg");

  // Listen to postMessage logs from the sandboxed iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data && e.data.__anon_preview_log) {
        const payload = e.data.__anon_preview_log;
        setLogs((prev) => [
          ...prev.slice(-49),
          {
            id: `log_${Date.now()}_${Math.random()}`,
            kind: payload.type || "log",
            message: payload.message || "",
            ts: Date.now(),
          },
        ]);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const markdownHtml = useMemo(() => {
    if (!file || !s.mdPreviewOpen || !isMd) return "";
    return renderMarkdown(file.content);
  }, [file, s.mdPreviewOpen, isMd]);

  // Generate self-contained HTML bundle by resolving linked project tabs
  const bundledHtml = useMemo(() => {
    if (!file || !s.mdPreviewOpen || !isHtml) return "";
    let code = file.content;

    // Inject console capture script at top of head or body
    const consoleInterceptor = `
      <script>
        (function() {
          function sendLog(type, args) {
            try {
              var msg = Array.prototype.slice.call(args).map(function(a) {
                if (typeof a === 'object') {
                  try { return JSON.stringify(a); } catch(e) { return String(a); }
                }
                return String(a);
              }).join(' ');
              window.parent.postMessage({ __anon_preview_log: { type: type, message: msg } }, '*');
            } catch(e) {}
          }
          var _log = console.log, _warn = console.warn, _err = console.error, _info = console.info;
          console.log = function() { sendLog('log', arguments); _log.apply(console, arguments); };
          console.warn = function() { sendLog('warn', arguments); _warn.apply(console, arguments); };
          console.error = function() { sendLog('error', arguments); _err.apply(console, arguments); };
          console.info = function() { sendLog('info', arguments); _info.apply(console, arguments); };
          window.onerror = function(msg, url, line) {
            sendLog('error', [msg + ' (line ' + line + ')']);
          };
        })();
      </script>
    `;

    // Replace <link rel="stylesheet" href="filename.css"> with <style>...</style> from project tabs
    code = code.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi, (match, href) => {
      const targetName = href.replace(/^\.\//, "").trim().toLowerCase();
      const cssFile = s.files.find((f) => f.name.toLowerCase() === targetName);
      if (cssFile) {
        return `<style data-inlined="${targetName}">\n${cssFile.content}\n</style>`;
      }
      return match;
    });

    // Replace <script src="filename.js"></script> with inline <script>...</script> from project tabs
    code = code.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
      const targetName = src.replace(/^\.\//, "").trim().toLowerCase();
      const jsFile = s.files.find((f) => f.name.toLowerCase() === targetName);
      if (jsFile) {
        return `<script data-inlined="${targetName}">\n${jsFile.content}\n</script>`;
      }
      return match;
    });

    if (/<head>/i.test(code)) {
      code = code.replace(/<head>/i, `<head>\n${consoleInterceptor}`);
    } else if (/<html>/i.test(code)) {
      code = code.replace(/<html>/i, `<html>\n<head>${consoleInterceptor}</head>`);
    } else {
      code = `${consoleInterceptor}\n${code}`;
    }

    return code;
  }, [file, s.files, s.mdPreviewOpen, isHtml]);

  if (!s.mdPreviewOpen || !file) return null;

  function handleOpenPopout() {
    if (!file) return;
    const blob = new Blob([bundledHtml || file.content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  function handleRefresh() {
    setLogs([]);
    setRefreshKey((k) => k + 1);
  }

  const frameWidthClass =
    deviceMode === "mobile"
      ? "w-[375px] max-w-full shadow-2xl hairline-all my-4"
      : deviceMode === "tablet"
        ? "w-[768px] max-w-full shadow-xl hairline-all my-3"
        : "w-full h-full";

  return (
    <div className="flex min-h-0 flex-1 flex-col hairline-l bg-[var(--anon-bg)]">
      {/* header toolbar */}
      <div className="flex h-8 items-center gap-2 hairline-b px-3 bg-[var(--anon-raise)]">
        <Eye className="h-3.5 w-3.5 anon-accent" />
        <span className="anon-mono text-xs anon-fg">
          {isHtml ? "web preview" : isMd ? "markdown preview" : isSvg ? "svg preview" : "preview"}
        </span>
        <span className="anon-mono text-[10px] anon-dim truncate max-w-[120px]">{file.name}</span>

        {/* Web device switcher for HTML */}
        {isHtml && (
          <div className="hidden sm:flex items-center gap-0.5 ml-2 hairline-l pl-2">
            <button
              onClick={() => setDeviceMode("desktop")}
              className={`p-1 rounded transition-colors ${
                deviceMode === "desktop" ? "bg-[var(--anon-panel)] anon-accent" : "anon-mut hover:anon-fg"
              }`}
              title="Desktop viewport (100%)"
              aria-label="Desktop viewport"
            >
              <Monitor className="h-3 w-3" />
            </button>
            <button
              onClick={() => setDeviceMode("tablet")}
              className={`p-1 rounded transition-colors ${
                deviceMode === "tablet" ? "bg-[var(--anon-panel)] anon-accent" : "anon-mut hover:anon-fg"
              }`}
              title="Tablet viewport (768px)"
              aria-label="Tablet viewport"
            >
              <Tablet className="h-3 w-3" />
            </button>
            <button
              onClick={() => setDeviceMode("mobile")}
              className={`p-1 rounded transition-colors ${
                deviceMode === "mobile" ? "bg-[var(--anon-panel)] anon-accent" : "anon-mut hover:anon-fg"
              }`}
              title="Mobile viewport (375px)"
              aria-label="Mobile viewport"
            >
              <Smartphone className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* action buttons */}
        <div className="ml-auto flex items-center gap-1">
          {isHtml && (
            <>
              <button
                onClick={handleRefresh}
                className="p-1 rounded anon-mut hover:anon-fg transition-colors"
                title="Reload preview"
                aria-label="Reload preview"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              <button
                onClick={handleOpenPopout}
                className="p-1 rounded anon-mut hover:anon-fg transition-colors"
                title="Open in new window"
                aria-label="Open in new window"
              >
                <ExternalLink className="h-3 w-3" />
              </button>
            </>
          )}

          <button
            onClick={() => s.toggleMdPreview()}
            className="anon-mut hover:anon-fg ml-1"
            aria-label="Close preview"
            title="Close preview (⌘⇧P)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* preview body */}
      <div className="flex min-h-0 flex-1 flex-col relative overflow-hidden">
        {isMd ? (
          <div
            className="anon-scroll md-preview flex-1 overflow-y-auto p-6 anon-sans text-sm leading-relaxed anon-fg"
            dangerouslySetInnerHTML={{ __html: markdownHtml }}
          />
        ) : isHtml ? (
          <div className="flex flex-1 flex-col items-center justify-center bg-[var(--anon-panel)]/30 overflow-auto relative">
            <iframe
              key={refreshKey}
              ref={iframeRef}
              srcDoc={bundledHtml}
              title={`Preview of ${file.name}`}
              sandbox="allow-scripts allow-modals allow-forms"
              className={`h-full bg-white transition-all duration-200 border-0 ${frameWidthClass}`}
            />
          </div>
        ) : isSvg ? (
          <div className="flex flex-1 items-center justify-center p-6 bg-[var(--anon-panel)]/30 overflow-auto">
            <div
              className="max-w-full max-h-full p-4 rounded bg-white/90 shadow-md inline-block"
              dangerouslySetInnerHTML={{ __html: file.content }}
            />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 anon-mut">
            <Code2 className="h-8 w-8 anon-dim" />
            <p className="anon-mono text-xs">no visual preview for .{file.name.split(".").pop()}</p>
            <p className="anon-mono text-[10px] anon-dim text-center max-w-xs">
              visual preview is available for <code className="anon-fg">.html</code>,{" "}
              <code className="anon-fg">.md</code>, and <code className="anon-fg">.svg</code> files.
              use the terminal to run {file.language || "code"}.
            </p>
          </div>
        )}

        {/* Live console drawer for HTML preview */}
        {isHtml && (
          <div className="flex-none hairline-t bg-[var(--anon-raise)]">
            <button
              onClick={() => setConsoleOpen(!consoleOpen)}
              className="flex h-6 w-full items-center gap-2 px-3 text-[10px] anon-mono anon-mut hover:anon-fg transition-colors"
            >
              <Terminal className="h-2.5 w-2.5 anon-accent" />
              <span>console ({logs.length})</span>
              {logs.some((l) => l.kind === "error") && (
                <span className="flex items-center gap-1 text-[var(--anon-danger)]">
                  <AlertCircle className="h-2.5 w-2.5" /> error
                </span>
              )}
              <span className="ml-auto">
                {consoleOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </span>
            </button>
            {consoleOpen && (
              <div className="anon-scroll max-h-32 overflow-y-auto px-3 py-1.5 anon-mono text-[11px] hairline-t bg-[var(--anon-bg)]">
                {logs.length === 0 ? (
                  <div className="anon-dim italic text-[10px]">no console output yet</div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className={`leading-tight py-0.5 whitespace-pre-wrap ${
                        log.kind === "error"
                          ? "text-[var(--anon-danger)]"
                          : log.kind === "warn"
                            ? "text-[var(--anon-warn)]"
                            : "anon-fg"
                      }`}
                    >
                      <span className="anon-dim mr-1.5">[{log.kind}]</span>
                      {log.message}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
