"use client";

/**
 * Room entry dialog — the real create/join flow.
 *
 * create: optional password + TTL → PBKDF2 (600k rounds) → AES-GCM key +
 * relay auth token → room reserved on the relay (POST /room/:code?create=1).
 * join: password (if the room has one) → same derivation → verified by the
 * relay (403 on mismatch). Wrong passwords fail with a real server check.
 */

import { useEffect } from "react";
import { Loader2, X, Lock, Timer, Shield } from "lucide-react";
import { useAnon } from "@/lib/store";
import { PBKDF2_ROUNDS } from "@/lib/relay";

export function RoomEntryDialog() {
  const s = useAnon();
  const open = s.entryMode !== null;
  const mode = s.entryMode;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !s.booting) s.closeEntry();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, s.booting, s]);

  if (!open || !mode) return null;

  const isCreate = mode === "create";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isCreate ? "Create encrypted room" : "Join encrypted room"}
      onClick={(e) => {
        if (e.target === e.currentTarget && !s.booting) s.closeEntry();
      }}
    >
      <div className="w-full max-w-sm hairline bg-[var(--anon-panel)] shadow-2xl">
        {/* header */}
        <div className="flex h-10 items-center justify-between hairline-b px-3">
          <div className="anon-mono inline-flex items-center gap-1.5 text-xs anon-fg">
            <Shield className="h-3.5 w-3.5 anon-ok" />
            {isCreate ? "new encrypted room" : `join room ${s.entryCode}`}
          </div>
          <button
            onClick={() => !s.booting && s.closeEntry()}
            className="anon-mut hover:anon-fg"
            aria-label="Close"
            disabled={s.booting}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* join info line */}
        {!isCreate && s.entryInfo && (
          <div className="anon-mono flex items-center gap-2 hairline-b bg-[var(--anon-raise)] px-3 py-1.5 text-[10px] anon-mut">
            <span className="inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "var(--anon-ok)" }} />
            live · {s.entryInfo.peers} peer{s.entryInfo.peers === 1 ? "" : "s"} online
            {s.entryInfo.locked && <span className="anon-warn">· locked</span>}
          </div>
        )}

        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void s.submitEntry();
          }}
        >
          {/* password */}
          <label className="flex flex-col gap-1.5">
            <span className="anon-mono inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider anon-dim">
              <Lock className="h-3 w-3" />
              {isCreate ? "room password (optional)" : "room password"}
            </span>
            <input
              type="password"
              value={s.entryPassword}
              onChange={(e) => s.setEntryPassword(e.target.value)}
              placeholder={isCreate ? "leave empty for code-only access" : "required for this room"}
              autoComplete="off"
              disabled={s.booting}
              className="anon-mono h-10 bg-[var(--anon-bg)] hairline px-3 text-sm outline-none focus:border-[var(--anon-accent)] disabled:opacity-50"
            />
            <span className="anon-mono text-[9.5px] anon-dim">
              {isCreate
                ? "the password never leaves this browser — the relay can't see it"
                : "the key is derived locally and verified by the relay"}
            </span>
          </label>

          {/* TTL (create only) */}
          {isCreate && (
            <label className="flex flex-col gap-1.5">
              <span className="anon-mono inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider anon-dim">
                <Timer className="h-3 w-3" />
                auto-erase after
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(["10m", "1h", "24h"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => s.setEntryTtl(t)}
                    disabled={s.booting}
                    className={`anon-mono h-9 hairline text-xs transition-colors ${
                      s.entryTtl === t
                        ? "bg-[var(--anon-accent)] text-[var(--anon-accent-fg)]"
                        : "bg-[var(--anon-bg)] anon-mut hover:anon-fg hover:border-[var(--anon-mut)]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <span className="anon-mono text-[9.5px] anon-dim">
                the room erases {s.entryTtl === "10m" ? "10 minutes" : s.entryTtl === "1h" ? "1 hour" : "24 hours"} after the last person leaves
              </span>
            </label>
          )}

          {/* error */}
          {s.bootError && (
            <p role="alert" className="anon-mono anim-shake text-[11px] px-2 py-1.5 hairline" style={{ color: "var(--anon-danger)", background: "var(--anon-raise)" }}>
              {s.bootError}
            </p>
          )}

          {/* submit */}
          <button
            type="submit"
            disabled={s.booting}
            className="anon-mono inline-flex h-10 items-center justify-center gap-2 bg-[var(--anon-accent)] px-4 text-sm font-medium text-[var(--anon-accent-fg)] transition-transform hover:brightness-110 active:translate-y-px disabled:opacity-60"
          >
            {s.booting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                deriving key · PBKDF2 {Math.round(PBKDF2_ROUNDS / 1000)}k…
              </>
            ) : isCreate ? (
              "create room →"
            ) : (
              "join room →"
            )}
          </button>

          <p className="anon-mono text-center text-[9.5px] anon-dim">
            PBKDF2-SHA256 · {(PBKDF2_ROUNDS / 1000).toFixed(0)}k rounds · AES-GCM-256 · zero-knowledge relay
          </p>
        </form>
      </div>
    </div>
  );
}
