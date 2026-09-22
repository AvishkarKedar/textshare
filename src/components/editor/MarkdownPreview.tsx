"use client";

import { useMemo } from "react";
import { useAnon } from "@/lib/store";
import { X, Eye } from "lucide-react";

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
 *
 * Link URLs are scheme-filtered (http/https/mailto/relative only) and
 * quote-encoded — so `javascript:` payloads and attribute breakouts in
 * user-authored markdown can neither execute nor alter the anchor tag.
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
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m: string, text: string, href: string) =>
        `<a href="${safeHref(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`);

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
    if (inUl) { out.push("</ul>"); inUl = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
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
      out.push('<hr />');
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
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inUl) { out.push("<ul>"); inUl = true; }
      const checked = cb[1] === "x";
      out.push(`<li class="cb"><span class="box ${checked ? "on" : ""}">${checked ? "✓" : ""}</span> ${inline(cb[2])}</li>`);
      continue;
    }
    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`);
      continue;
    }
    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      if (inUl) { out.push("</ul>"); inUl = false; }
      if (!inOl) { out.push("<ol>"); inOl = true; }
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

export function MarkdownPreview() {
  const s = useAnon();
  const file = s.files.find((f) => f.id === s.activeFileId);

  const html = useMemo(() => {
    if (!file || !s.mdPreviewOpen) return "";
    if (file.language !== "markdown" && !file.name.endsWith(".md")) return "";
    return renderMarkdown(file.content);
  }, [file, s.mdPreviewOpen]);

  if (!s.mdPreviewOpen || !file) return null;
  const isMd = file.language === "markdown" || file.name.endsWith(".md");

  return (
    <div className="flex min-h-0 flex-1 flex-col hairline-l bg-[var(--anon-bg)]">
      {/* header */}
      <div className="flex h-8 items-center gap-2 hairline-b px-3 anon-raise">
        <Eye className="h-3.5 w-3.5 anon-accent" />
        <span className="anon-mono text-xs anon-fg">preview</span>
        <span className="anon-mono text-[10px] anon-dim truncate">{file.name}</span>
        <button
          onClick={() => s.toggleMdPreview()}
          className="anon-mut hover:anon-fg ml-auto"
          aria-label="Close preview"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {isMd ? (
        <div
          className="anon-scroll md-preview flex-1 overflow-y-auto p-6 anon-sans text-sm leading-relaxed anon-fg"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 anon-mut">
          <Eye className="h-8 w-8 anon-dim" />
          <p className="anon-mono text-xs">no preview for .{file.name.split(".").pop()}</p>
          <p className="anon-mono text-[10px] anon-dim text-center max-w-xs">
            switch to a <code className="anon-fg">.md</code> file to render markdown.
            other file types can be run via the terminal instead.
          </p>
        </div>
      )}
    </div>
  );
}
