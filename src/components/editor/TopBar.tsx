"use client";

import { useState, useRef, useEffect } from "react";
import {
  Play,
  MessageSquare,
  MoreHorizontal,
  Users,
  LogOut,
  Settings,
  Link2,
  History,
  Files,
  Globe,
  PenTool,
  Sparkles,
  Mic,
  MicOff,
  Volume2,
  Maximize2,
  Eye,
  Terminal as TerminalIcon,
  Command,
  Bell,
  Loader2,
  FlaskConical,
  Wand2,
  Shield,
  Download,
  Radio,
  Bookmark,
  Activity,
  HelpCircle,
} from "lucide-react";
import { useAnon } from "@/lib/store";
import { initials } from "@/lib/themes";

export function TopBar() {
  const s = useAnon();
  const [overflow, setOverflow] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflow(false);
      }
    }
    if (overflow) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [overflow]);

  return (
    <header className="sticky top-0 z-30 flex h-10 items-center gap-2 hairline-b anon-raise px-2 sm:px-3">
      {/* left: logo + room chip */}
      <button
        onClick={() => s.exitRoom()}
        className="anon-mono flex h-7 items-center gap-1.5 px-1.5 text-sm hover:bg-[var(--anon-panel)]"
        title="Back to landing"
      >
        <span className="anon-accent">{'>'}</span>
        <span className="hidden sm:inline">anonshare</span>
      </button>

      <div className="anon-mono flex h-7 items-center gap-1.5 hairline bg-[var(--anon-panel)] px-2 text-xs">
        <span>{s.roomEmoji}</span>
        <span className="hidden max-w-[140px] truncate sm:inline">{s.roomTitle}</span>
        <span className="anon-dim">·</span>
        <span className="anon-accent">{s.roomCode || "ABC123"}</span>
        <button
          onClick={() => s.toggleInvite()}
          className="ml-1 inline-flex items-center gap-1 anon-mut hover:anon-fg"
          title="Invite others"
        >
          <Link2 className="h-3 w-3" />
        </button>
      </div>

      {/* center: invite button (desktop) */}
      <button
        onClick={() => s.toggleInvite()}
        className="anon-mono hidden h-7 items-center gap-1.5 px-2 text-xs hairline hover:bg-[var(--anon-panel)] md:inline-flex"
      >
        <Users className="h-3.5 w-3.5" /> Invite
      </button>

      {/* avatar stack */}
      <div className="hidden items-center -space-x-1.5 md:flex">
        {s.participants.slice(0, 4).map((p) => (
          <span
            key={p.id}
            title={`${p.name}${p.isOwner ? " · owner" : ""}`}
            className="anon-mono relative inline-flex h-6 w-6 items-center justify-center hairline text-[10px] font-semibold text-black"
            style={{ background: p.color, zIndex: p.isOwner ? 5 : 1 }}
          >
            {initials(p.name)}
            {p.isOwner && (
              <span className="absolute -bottom-2 -right-1 text-[8px]">★</span>
            )}
            {p.online && (
              <span
                className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--anon-ok)" }}
              />
            )}
          </span>
        ))}
        {s.participants.length > 4 && (
          <span className="anon-mono ml-2 text-[10px] anon-mut">
            +{s.participants.length - 4}
          </span>
        )}
      </div>

      {/* right: primary actions (Run + Terminal + Chat + Notifications + overflow) */}
      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => s.runCode()}
          disabled={s.running}
          className="anon-mono inline-flex h-7 items-center gap-1.5 bg-[var(--anon-accent)] px-3 text-xs font-medium text-[var(--anon-accent-fg)] transition-transform hover:brightness-110 active:translate-y-px disabled:opacity-60"
          title="Run code · ⌘↵"
        >
          {s.running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Run
        </button>

        <button
          onClick={() => s.toggleTerminal()}
          className={`anon-mono relative hidden h-7 items-center gap-1.5 px-2 text-xs hairline hover:bg-[var(--anon-panel)] sm:inline-flex ${
            s.terminalOpen ? "bg-[var(--anon-panel)]" : ""
          }`}
          title="Toggle terminal"
          aria-label="Toggle terminal"
        >
          <TerminalIcon className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={() => s.toggleChat()}
          className={`anon-mono relative inline-flex h-7 items-center gap-1.5 px-2 text-xs hairline hover:bg-[var(--anon-panel)] ${
            s.chatOpen ? "bg-[var(--anon-panel)]" : ""
          }`}
          title="Toggle chat · ⌘J"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Chat</span>
        </button>

        {/* voice indicator */}
        <button
          onClick={() => s.toggleVoice()}
          className={`anon-mono relative inline-flex h-7 w-7 items-center justify-center hairline hover:bg-[var(--anon-panel)] ${
            s.voiceOpen ? "bg-[var(--anon-panel)]" : ""
          } ${s.voice.connected && s.voice.speaking ? "anim-pulse-ring" : ""}`}
          title="Voice · ⌘⇧V"
          aria-label="Toggle voice"
        >
          {s.voice.connected ? (
            s.voice.muted ? <MicOff className="h-3.5 w-3.5" style={{ color: "var(--anon-danger)" }} /> :
            <Mic className="h-3.5 w-3.5" style={{ color: s.voice.speaking ? "var(--anon-ok)" : "var(--anon-fg)" }} />
          ) : (
            <Mic className="h-3.5 w-3.5 anon-mut" />
          )}
          {s.voice.connected && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full" style={{ background: "var(--anon-ok)" }} />
          )}
        </button>

        {/* notifications bell */}
        <button
          onClick={() => s.toggleNotifications()}
          className={`anon-mono relative inline-flex h-7 w-7 items-center justify-center hairline hover:bg-[var(--anon-panel)] ${
            s.notificationsOpen ? "bg-[var(--anon-panel)]" : ""
          }`}
          title="Notifications"
          aria-label={`Notifications (${s.unreadCount} unread)`}
        >
          <Bell className="h-3.5 w-3.5" />
          {s.unreadCount > 0 && (
            <span className="anon-mono absolute -right-1 -top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center bg-[var(--anon-danger)] px-0.5 text-[9px] font-semibold text-white">
              {s.unreadCount}
            </span>
          )}
        </button>

        {/* overflow menu */}
        <div className="relative" ref={overflowRef}>
          <button
            onClick={() => setOverflow((v) => !v)}
            className={`anon-mono inline-flex h-7 w-7 items-center justify-center hairline hover:bg-[var(--anon-panel)] ${
              overflow ? "bg-[var(--anon-panel)]" : ""
            }`}
            title="More options"
            aria-label="More actions"
            aria-expanded={overflow}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {overflow && (
            <div className="anim-rise absolute right-0 top-8 w-56 hairline anon-panel shadow-xl shadow-black/30 z-50">
              <OverflowItem icon={Eye} label="Markdown preview" k="⌘⇧P" onClick={() => { s.toggleMdPreview(); setOverflow(false); }} active={s.mdPreviewOpen} />
              <OverflowItem icon={Files} label="Files" k="⌘B" onClick={() => { s.toggleFiles(); setOverflow(false); }} active={s.filesOpen} />
              <OverflowItem icon={History} label="History (time machine)" k="⌘⇧H" onClick={() => { s.toggleHistory(); setOverflow(false); }} active={s.historyOpen} />
              <OverflowItem icon={FlaskConical} label="Test runner" k="⌘⇧T" onClick={() => { s.toggleTestPanel(); setOverflow(false); }} active={s.testPanelOpen} />
              <OverflowItem icon={Wand2} label="Generative UI" k="⌘⇧G" onClick={() => { s.toggleGenerative(); setOverflow(false); }} active={s.generativeOpen} />
              <OverflowItem icon={Radio} label="Voice chat" k="⌘⇧V" onClick={() => { s.toggleVoice(); setOverflow(false); }} active={s.voiceOpen} />
              <OverflowItem icon={Globe} label="Browser" k="⌘⇧B" onClick={() => { s.toggleBrowser(); setOverflow(false); }} active={s.browserOpen} />
              <OverflowItem icon={Shield} label="Crypto explainer" k="⌘⇧K" onClick={() => { s.toggleCrypto(); setOverflow(false); }} active={s.cryptoOpen} />
              <OverflowItem icon={Sparkles} label="Restart onboarding tour" k="⌘⇧O" onClick={() => { s.startTour(); setOverflow(false); }} />
              <OverflowItem icon={PenTool} label="Whiteboard" k="⌘⇧W" onClick={() => { s.toggleWhiteboard(); setOverflow(false); }} active={s.whiteboardOpen} />
              <OverflowItem icon={TerminalIcon} label="Terminal" k="⌘\\" onClick={() => { s.toggleTerminal(); setOverflow(false); }} active={s.terminalOpen} />
              <OverflowItem icon={Download} label="Export project ZIP" k="⌘⇧E" onClick={() => { s.exportProjectZip(); setOverflow(false); }} />
              <OverflowItem icon={Bookmark} label="Recent rooms" k="⌘⇧R" onClick={() => { s.toggleBookmarks(); setOverflow(false); }} active={s.bookmarksOpen} />
              <OverflowItem icon={Activity} label="System status" k="⌘⇧Y" onClick={() => { s.toggleStatus(); setOverflow(false); }} active={s.statusOpen} />
              <OverflowItem icon={Shield} label="Threat model" k="⌘⇧X" onClick={() => { s.toggleSecurity(); setOverflow(false); }} active={s.securityOpen} />
              <OverflowItem icon={HelpCircle} label="FAQs & Help" k="⌘⇧F" onClick={() => { s.toggleFaq(); setOverflow(false); }} active={s.faqOpen} />
              <div className="hairline-t" />
              <OverflowItem icon={Maximize2} label="Zen mode" k="⌘." onClick={() => { s.toggleZen(); setOverflow(false); }} active={s.zenMode} />
              <div className="hairline-t" />
              <OverflowItem icon={Settings} label="Settings" k="⌘," onClick={() => { s.toggleSettings(); setOverflow(false); }} />
              <OverflowItem icon={Command} label="Command palette" k="⌘K" onClick={() => { s.togglePalette(); setOverflow(false); }} />
              <OverflowItem icon={LogOut} label="Leave room" k="" onClick={() => { s.exitRoom(); setOverflow(false); }} danger />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function OverflowItem({
  icon: Icon,
  label,
  k,
  onClick,
  active,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  k: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left anon-mono text-xs hover:bg-[var(--anon-raise)] cursor-pointer ${
        danger ? "text-[var(--anon-danger)]" : ""
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${active ? "anon-accent" : "anon-mut"}`} />
      <span className="flex-1">{label}</span>
      {k && <span className="anon-dim text-[10px]">{k}</span>}
      {active && <span className="anon-accent text-[10px]">●</span>}
    </button>
  );
}
