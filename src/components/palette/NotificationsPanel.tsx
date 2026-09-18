"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Bell, AtSign, AlertTriangle, Info, CheckCheck, Trash2, BellOff } from "lucide-react";
import { useAnon, type AppNotification } from "@/lib/store";

export function NotificationsPanel() {
  const s = useAnon();
  if (!s.notificationsOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-start justify-end bg-black/40"
        onClick={() => s.toggleNotifications()}
      >
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-full w-full max-w-sm flex-col bg-[var(--anon-panel)] hairline-l shadow-2xl shadow-black/50"
        >
          <div className="flex h-11 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              <Bell className="h-4 w-4 anon-accent" /> Notifications
              {s.unreadCount > 0 && (
                <span className="anon-mono ml-1 inline-flex h-4 min-w-4 items-center justify-center bg-[var(--anon-accent)] px-1 text-[10px] text-[var(--anon-accent-fg)]">
                  {s.unreadCount}
                </span>
              )}
            </h2>
            <button onClick={() => s.toggleNotifications()} className="anon-mut hover:anon-fg">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* permission toggle */}
          <div className="hairline-b flex items-center justify-between px-4 py-2">
            <span className="anon-mono text-[10px] anon-mut inline-flex items-center gap-1.5">
              {s.notificationsEnabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
              desktop notifications
            </span>
            <button
              onClick={async () => {
                if (!s.notificationsEnabled && typeof Notification !== "undefined") {
                  const perm = await Notification.requestPermission();
                  if (perm === "granted") {
                    s.setNotificationsEnabled(true);
                    new Notification("anonshare", { body: "Desktop notifications enabled. You'll hear about @mentions and room warnings." });
                  }
                } else {
                  s.setNotificationsEnabled(false);
                }
              }}
              className={`relative h-4 w-7 transition-colors ${s.notificationsEnabled ? "bg-[var(--anon-accent)]" : "bg-[var(--anon-line2)]"}`}
              role="switch"
              aria-checked={s.notificationsEnabled}
              aria-label="Toggle desktop notifications"
            >
              <span
                className={`absolute top-0.5 h-3 w-3 bg-white transition-transform ${s.notificationsEnabled ? "translate-x-3.5" : "translate-x-0.5"}`}
              />
            </button>
          </div>

          {/* list */}
          <div className="anon-scroll flex-1 overflow-y-auto">
            {s.notifications.length === 0 && (
              <div className="anon-mono px-4 py-10 text-center text-xs anon-mut">
                no notifications — you&apos;re all caught up.
              </div>
            )}
            {s.notifications.map((n) => (
              <NotifRow key={n.id} n={n} />
            ))}
          </div>

          {/* footer */}
          <div className="hairline-t flex items-center gap-2 p-2">
            <button
              onClick={() => s.markAllRead()}
              className="anon-mono inline-flex h-9 flex-1 items-center justify-center gap-1.5 hairline px-3 text-xs hover:bg-[var(--anon-raise)]"
            >
              <CheckCheck className="h-3.5 w-3.5" /> mark all read
            </button>
            <button
              onClick={() => s.clearNotifications()}
              className="anon-mono inline-flex h-9 items-center justify-center gap-1.5 hairline px-3 text-xs hover:bg-[var(--anon-raise)]"
              style={{ color: "var(--anon-danger)" }}
            >
              <Trash2 className="h-3.5 w-3.5" /> clear
            </button>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}

function NotifRow({ n }: { n: AppNotification }) {
  const icon = n.kind === "mention" ? AtSign : n.kind === "warning" ? AlertTriangle : n.kind === "system" ? Bell : Info;
  const color =
    n.kind === "mention"
      ? "var(--anon-accent)"
      : n.kind === "warning"
        ? "var(--anon-warn)"
        : n.kind === "system"
          ? "var(--anon-ok)"
          : "var(--anon-mut)";
  const Icon = icon;
  return (
    <div
      className={`flex gap-3 hairline-b px-4 py-3 ${n.read ? "" : "bg-[var(--anon-raise)]"}`}
    >
      <span className="mt-0.5 flex-none" style={{ color }}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="anon-sans text-xs font-medium anon-fg">{n.title}</div>
        {n.body && <p className="anon-sans mt-0.5 text-[11px] leading-snug anon-mut">{n.body}</p>}
        <div className="anon-mono mt-1 text-[9px] anon-dim">{relativeTime(n.ts)}</div>
      </div>
      {!n.read && <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full" style={{ background: "var(--anon-accent)" }} />}
    </div>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + "m ago";
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + "h ago";
  return Math.floor(diff / 86_400_000) + "d ago";
}
