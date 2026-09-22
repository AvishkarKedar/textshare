"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Sun,
  Moon,
  Palette,
  Type,
  Keyboard,
  Trash2,
  Save,
  AlertTriangle,
  Lock,
  Ban,
  Timer,
} from "lucide-react";
import { useAnon, SHORTCUTS } from "@/lib/store";
import { THEMES, PARTICIPANT_COLORS } from "@/lib/themes";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";

export function SettingsPanel() {
  const s = useAnon();
  if (!s.settingsOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
        onClick={() => s.toggleSettings()}
      >
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-full w-full max-w-sm flex-col bg-[var(--anon-panel)] hairline-l shadow-2xl shadow-black/50"
        >
          {/* header */}
          <div className="flex h-11 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans text-sm font-semibold">Settings</h2>
            <button onClick={() => s.toggleSettings()} className="anon-mut hover:anon-fg">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="anon-scroll flex-1 overflow-y-auto p-4 space-y-6">
            {/* identity */}
            <Section title="Identity" icon={Palette}>
              <label className="anon-mono text-[10px] uppercase tracking-wider anon-dim">
                display name
              </label>
              <input
                value={s.displayName}
                onChange={(e) => s.setDisplayName(e.target.value)}
                maxLength={24}
                className="anon-mono mt-1 w-full bg-[var(--anon-bg)] hairline px-3 py-2 text-sm outline-none focus:border-[var(--anon-accent)]"
              />
              <div className="anon-mono mt-3 text-[10px] uppercase tracking-wider anon-dim">
                your color
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PARTICIPANT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => s.setColor(c)}
                    className={`h-7 w-7 transition-transform hover:scale-110 ${s.color === c ? "ring-2 ring-offset-2 ring-offset-[var(--anon-panel)]" : ""}`}
                    style={{ background: c, outline: s.color === c ? `2px solid ${c}` : "none", outlineOffset: 2 }}
                    aria-label={`Pick color ${c}`}
                  />
                ))}
              </div>
            </Section>

            {/* theme */}
            <Section title="Theme" icon={s.theme === "light" ? Sun : Moon}>
              <div className="grid grid-cols-1 gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      s.setTheme(t.id);
                      toast.success(`Theme: ${t.name}`);
                    }}
                    className={`flex items-center gap-3 p-2 hairline transition-colors ${
                      s.theme === t.id ? "bg-[var(--anon-raise)] border-[var(--anon-accent)]" : "hover:bg-[var(--anon-raise)]"
                    }`}
                  >
                    <div className="flex">
                      {t.swatch.map((c, i) => (
                        <span
                          key={i}
                          className="h-6 w-3 first:rounded-l-none last:rounded-r-none"
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                    <span className="anon-mono text-xs anon-fg">{t.name}</span>
                    {s.theme === t.id && (
                      <span className="anon-mono ml-auto text-[10px] anon-accent">● active</span>
                    )}
                  </button>
                ))}
              </div>
            </Section>

            {/* editor */}
            <Section title="Editor" icon={Type}>
              <div className="anon-mono text-[10px] uppercase tracking-wider anon-dim">
                font size · {s.fontSize}px
              </div>
              <input
                type="range"
                min={12}
                max={18}
                value={s.fontSize}
                onChange={(e) => s.setFontSize(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--anon-accent)]"
              />
              <div className="anon-mono mt-3 flex items-center justify-between text-[10px] uppercase tracking-wider anon-dim">
                colored chat names
                <button
                  onClick={() => s.setChatColored(!s.chatColored)}
                  className={`relative h-4 w-7 transition-colors ${s.chatColored ? "bg-[var(--anon-accent)]" : "bg-[var(--anon-line2)]"}`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 bg-white transition-transform ${s.chatColored ? "translate-x-3.5" : "translate-x-0.5"}`}
                  />
                </button>
              </div>
            </Section>

            {/* keybindings */}
            <Section title="Keybindings" icon={Keyboard}>
              <div className="grid grid-cols-3 gap-1.5">
                {(["standard", "emacs", "vim"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => s.setKeybindings(k)}
                    className={`anon-mono py-2 text-xs hairline transition-colors ${
                      s.keybindings === k ? "bg-[var(--anon-accent)] text-[var(--anon-accent-fg)]" : "hover:bg-[var(--anon-raise)]"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </Section>

            {/* custom shortcut remapping */}
            <Section title="Remap shortcuts" icon={Keyboard}>
              <p className="anon-mono text-[10px] anon-dim leading-relaxed mb-2">
                click a key to remap — press your new combo. changes are local + persisted.
              </p>
              <div className="space-y-1">
                {SHORTCUTS.slice(0, 10).map((sc) => {
                  const custom = s.customKeys[sc.label];
                  const display = custom || sc.keys;
                  return (
                    <CustomKeyRow
                      key={sc.label}
                      label={sc.label}
                      defaultKeys={sc.keys}
                      current={display}
                      onCapture={(combo) => s.setCustomKey(sc.label, combo)}
                      onReset={() => {
                        s.setCustomKey(sc.label, sc.keys);
                        toast.success(`Reset to ${sc.keys}`);
                      }}
                    />
                  );
                })}
              </div>
              <button
                onClick={() => {
                  s.resetCustomKeys();
                  toast.success("All shortcuts reset to defaults");
                }}
                className="anon-mono mt-2 w-full hairline px-3 py-1.5 text-[10px] anon-mut hover:bg-[var(--anon-raise)] hover:anon-fg"
              >
                reset all to defaults
              </button>
            </Section>

            {/* owner danger zone */}
            {s.isOwner && (
              <Section title="Owner · danger zone" icon={AlertTriangle} danger>
                <button
                  onClick={() => { void s.lockRoom(); }}
                  className="anon-mono flex w-full items-center gap-2 py-2 text-left text-xs hairline px-3 hover:bg-[var(--anon-raise)] cursor-pointer"
                >
                  <Lock className="h-3.5 w-3.5" style={{ color: "var(--anon-warn)" }} /> {s.roomState?.locked ? "Unlock room (editable)" : "Lock room (read-only)"}
                </button>
                <button
                  onClick={() => { void s.suspendRoom(); }}
                  className="anon-mono flex w-full items-center gap-2 py-2 text-left text-xs hairline px-3 hover:bg-[var(--anon-raise)] cursor-pointer"
                >
                  <Ban className="h-3.5 w-3.5" style={{ color: "var(--anon-warn)" }} /> {s.roomState?.suspended ? "Resume room (peers rejoin)" : "Suspend room"}
                </button>
                <button
                  onClick={() => { void s.changeRoomTtl(); }}
                  className="anon-mono flex w-full items-center gap-2 py-2 text-left text-xs hairline px-3 hover:bg-[var(--anon-raise)] cursor-pointer"
                >
                  <Timer className="h-3.5 w-3.5" style={{ color: "var(--anon-warn)" }} /> Change TTL (now: {s.ttl})
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this room for everyone? All files, chat and code are erased immediately and the room code stops working.")) {
                      void s.deleteRoom();
                    }
                  }}
                  className="anon-mono flex w-full items-center gap-2 py-2 text-left text-xs hairline px-3 hover:bg-[var(--anon-raise)] cursor-pointer"
                  style={{ color: "var(--anon-danger)" }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete room now
                </button>
              </Section>
            )}
          </div>

          {/* footer */}
          <div className="hairline-t p-3 flex items-center gap-2">
            <button
              onClick={() => {
                toast.success("Settings saved", { description: "Stored locally — no server roundtrip." });
                s.toggleSettings();
              }}
              className="anon-mono inline-flex h-9 flex-1 items-center justify-center gap-1.5 bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] text-xs hover:brightness-110"
            >
              <Save className="h-3.5 w-3.5" /> Save
            </button>
            <button
              onClick={() => {
                if (typeof indexedDB !== "undefined") {
                  indexedDB.deleteDatabase("anonshare-offline");
                }
                toast.success("Offline copy deleted");
              }}
              className="anon-mono inline-flex h-9 items-center justify-center gap-1.5 hairline px-3 text-xs hover:bg-[var(--anon-raise)]"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear offline
            </button>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}

function Section({
  title,
  icon: Icon,
  children,
  danger,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section>
      <h3
        className={`anon-mono mb-3 inline-flex items-center gap-1.5 text-xs uppercase tracking-wider ${
          danger ? "" : "anon-dim"
        }`}
        style={{ color: danger ? "var(--anon-danger)" : undefined }}
      >
        <Icon className="h-3 w-3" /> {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function CustomKeyRow({
  label,
  defaultKeys,
  current,
  onCapture,
  onReset,
}: {
  label: string;
  defaultKeys: string;
  current: string;
  onCapture: (combo: string) => void;
  onReset: () => void;
}) {
  const [capturing, setCapturing] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!capturing) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      // build a combo string
      const parts: string[] = [];
      if (e.metaKey || e.ctrlKey) parts.push("⌘");
      if (e.shiftKey) parts.push("⇧");
      if (e.altKey) parts.push("⌥");
      let key = e.key;
      if (key === " ") key = "Space";
      else if (key === "Enter") key = "↵";
      else if (key === "Escape") {
        setCapturing(false);
        return;
      } else if (key === "Backspace") {
        // backspace = reset to default
        onReset();
        setCapturing(false);
        return;
      } else if (key.length === 1) {
        key = key.toUpperCase();
      }
      if (parts.length > 0 || key.length > 1) {
        parts.push(key);
        onCapture(parts.join(" "));
        setCapturing(false);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, onCapture, onReset]);

  const isCustom = current !== defaultKeys;

  return (
    <div className="flex items-center gap-2 px-2 py-1 hairline bg-[var(--anon-bg)]">
      <span className="anon-mono flex-1 truncate text-[11px] anon-mut">{label}</span>
      <button
        ref={ref}
        onClick={() => setCapturing((v) => !v)}
        className={`anon-mono hairline px-2 py-1 text-[10px] ${
          capturing
            ? "bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] border-[var(--anon-accent)] anim-pulse-ring"
            : isCustom
              ? "anon-accent border-[var(--anon-accent)]"
              : "anon-fg hover:bg-[var(--anon-raise)]"
        }`}
      >
        {capturing ? "press keys…" : current}
      </button>
      {isCustom && (
        <button
          onClick={onReset}
          className="anon-mono text-[9px] anon-dim hover:anon-fg"
          title="Reset to default"
        >
          ⟲
        </button>
      )}
    </div>
  );
}
