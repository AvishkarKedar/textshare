"use client";

import { useState, useRef, useEffect } from "react";
import { useAnon, type ChatMessage } from "@/lib/store";
import { initials } from "@/lib/themes";
import { Pin, Reply, Send, Code2, X, Hash } from "lucide-react";
import { setTyping } from "@/lib/session";

export function ChatSidebar() {
  const s = useAnon();
  const [draft, setDraft] = useState("");
  const [replyParent, setReplyParent] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [s.messages.length]);

  const typingPeers = s.participants.filter((p) => p.typing && p.id !== "me");

  function onDraftChange(v: string) {
    setDraft(v);
    // broadcast "typing…" to the room over encrypted awareness
    if (v.trim()) setTyping("chat");
  }

  function send() {
    if (!draft.trim()) return;
    // addMessage pushes into the E2EE Yjs chat array when a session is
    // live — peers receive it encrypted via the relay; local fallback keeps
    // the UI usable otherwise.
    s.addMessage({
      authorId: "me",
      authorName: s.displayName || "you",
      color: s.color,
      body: draft,
      pinned: false,
      codeBlock: null,
      threadParent: null,
    });
    setDraft("");
  }

  function detectCode(input: string): { lang: string; src: string } | null {
    const m = input.match(/^```(\w+)?\s*([\s\S]*?)```$/);
    if (m) return { lang: m[1] || "text", src: m[2].trim() };
    return null;
  }

  function handleSend() {
    const code = detectCode(draft);
    if (code) {
      s.addMessage({
        authorId: "me",
        authorName: s.displayName || "you",
        color: s.color,
        body: "shared a snippet",
        pinned: false,
        codeBlock: code,
        threadParent: null,
      });
      setDraft("");
      return;
    }
    send();
  }

  const pinned = s.messages.filter((m) => m.pinned);
  const topLevel = s.messages.filter((m) => !m.threadParent);

  if (!s.chatOpen) return null;

  return (
    <aside className="fixed inset-0 z-40 flex h-full flex-col bg-[var(--anon-panel)] shadow-2xl shadow-black/50 md:static md:z-auto md:h-full md:w-72 md:flex-none md:border-l md:hairline-l md:shadow-none lg:w-80">
      {/* header */}
      <div className="flex h-9 items-center justify-between hairline-b px-3">
        <div className="anon-mono inline-flex items-center gap-1.5 text-xs">
          <Hash className="h-3 w-3 anon-mut" /> room chat
          <span className="anon-dim md:hidden">· {s.participants.filter((p) => p.online).length} online</span>
        </div>
        <button
          onClick={() => s.toggleChat()}
          className="anon-mut hover:anon-fg"
          aria-label="Close chat"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* pinned bar */}
      {pinned.length > 0 && (
        <div className="hairline-b bg-[var(--anon-raise)] px-3 py-2">
          <div className="anon-mono mb-1 text-[10px] uppercase tracking-wider anon-dim inline-flex items-center gap-1">
            <Pin className="h-2.5 w-2.5" /> pinned
          </div>
          {pinned.map((m) => (
            <div key={m.id} className="anon-mono text-[11px] anon-mut">
              <span style={{ color: m.color }}>{m.authorName}:</span> {m.body.slice(0, 80)}
              {m.body.length > 80 ? "…" : ""}
            </div>
          ))}
        </div>
      )}

      {/* messages */}
      <div ref={scrollRef} className="anon-scroll flex-1 overflow-y-auto p-3 space-y-3">
        {s.messages.length === 0 && (
          <div className="anon-mono py-6 text-center text-[11px] anon-dim">
            no messages yet — say hi (end-to-end encrypted)
          </div>
        )}
        {topLevel.map((m) => (
          <MessageBubble
            key={m.id}
            m={m}
            onReply={() => setReplyParent(m.id)}
            onPin={() => s.pinMessage(m.id)}
          />
        ))}
      </div>

      {/* typing indicator */}
      {typingPeers.length > 0 && (
        <div className="anon-mono hairline-t flex items-center gap-1.5 px-3 py-1.5 text-[10px]" style={{ color: "var(--anon-ok)" }}>
          <span className="inline-flex items-center -space-x-1">
            {typingPeers.slice(0, 3).map((p) => (
              <span
                key={p.id}
                className="inline-flex h-3.5 w-3.5 items-center justify-center text-[7px] font-semibold text-black"
                style={{ background: p.color }}
              >
                {initials(p.name)}
              </span>
            ))}
          </span>
          {typingPeers.length === 1
            ? `${typingPeers[0].name} is typing`
            : typingPeers.length === 2
              ? `${typingPeers[0].name} & ${typingPeers[1].name} are typing`
              : "several people are typing"}
          <span className="anim-beat">…</span>
        </div>
      )}

      {/* reply context */}
      {replyParent && (
        <div className="hairline-t bg-[var(--anon-raise)] px-3 py-1.5 flex items-center gap-2">
          <Reply className="h-3 w-3 anon-accent" />
          <span className="anon-mono text-[10px] anon-mut flex-1 truncate">
            replying to thread
          </span>
          <button onClick={() => setReplyParent(null)} className="anon-mut hover:anon-fg">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* composer */}
      <div className="hairline-t p-2">
        <div className="flex items-end gap-1.5">
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Message the room…  ``` for code"
            rows={2}
            className="anon-mono anon-scroll flex-1 resize-none bg-[var(--anon-bg)] hairline px-2 py-1.5 text-[12px] outline-none focus:border-[var(--anon-accent)]"
          />
          <button
            onClick={handleSend}
            className="inline-flex h-8 w-8 flex-none items-center justify-center bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] hover:brightness-110"
            aria-label="Send"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="anon-mono mt-1 text-[10px] anon-dim">
          {detectCode(draft) ? <span className="anon-ok inline-flex items-center gap-1"><Code2 className="h-2.5 w-2.5" /> detected code block</span> : "enter = send · shift+enter = newline"}
        </div>
      </div>
    </aside>
  );
}

function MessageBubble({
  m,
  onReply,
  onPin,
}: {
  m: ChatMessage;
  onReply: () => void;
  onPin: () => void;
}) {
  const s = useAnon();
  const replies = s.messages.filter((x) => x.threadParent === m.id);
  return (
    <div className="group">
      <div className="flex gap-2">
        <span
          className="anon-mono mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center text-[10px] font-semibold text-black"
          style={{ background: m.color }}
        >
          {initials(m.authorName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span
              className="anon-mono text-[11px] font-semibold"
              style={{ color: s.chatColored ? m.color : "var(--anon-fg)" }}
            >
              {m.authorName}
            </span>
            <span className="anon-mono text-[9px] anon-dim">{relativeTime(m.ts)}</span>
          </div>
          <p className="anon-sans mt-0.5 break-words text-[12px] leading-snug anon-fg">
            {m.body}
          </p>
          {m.codeBlock && (
            <pre className="anon-mono anon-scroll mt-1.5 max-h-40 overflow-auto hairline bg-[var(--anon-bg)] p-2 text-[10.5px] leading-snug">
              <code>{m.codeBlock.src}</code>
            </pre>
          )}
          {/* actions */}
          <div className="mt-1 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <button onClick={onReply} className="anon-mono inline-flex items-center gap-1 text-[10px] anon-mut hover:anon-fg">
              <Reply className="h-2.5 w-2.5" /> reply
            </button>
            <button onClick={onPin} className="anon-mono inline-flex items-center gap-1 text-[10px] anon-mut hover:anon-warn">
              <Pin className="h-2.5 w-2.5" /> {m.pinned ? "unpin" : "pin"}
            </button>
          </div>

          {/* threaded replies */}
          {replies.length > 0 && (
            <div className="mt-1.5 hairline-l ml-2 pl-2 space-y-1.5" style={{ borderColor: "var(--anon-line2)" }}>
              {replies.map((r) => (
                <div key={r.id}>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="anon-mono text-[10px] font-semibold"
                      style={{ color: s.chatColored ? r.color : "var(--anon-fg)" }}
                    >
                      {r.authorName}
                    </span>
                  </div>
                  <p className="anon-sans break-words text-[11px] leading-snug anon-mut">
                    {r.body}
                  </p>
                  {r.codeBlock && (
                    <pre className="anon-mono anon-scroll mt-1 max-h-32 overflow-auto hairline bg-[var(--anon-bg)] p-1.5 text-[10px]">
                      <code>{r.codeBlock.src}</code>
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + "m";
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + "h";
  return Math.floor(diff / 86_400_000) + "d";
}
