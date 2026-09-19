"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Lock,
  Key,
  Shield,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";
import { useAnon } from "@/lib/store";
import { toast } from "sonner";

export function CryptoModal() {
  const s = useAnon();
  const [copied, setCopied] = useState<string | null>(null);
  if (!s.cryptoOpen) return null;
  const r = s.cryptoResult;

  function copy(kind: string, value: string) {
    navigator.clipboard?.writeText(value);
    setCopied(kind);
    toast.success(`${kind} copied`);
    setTimeout(() => setCopied(null), 1200);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={() => s.toggleCrypto()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[88vh] w-full max-w-3xl flex-col hairline anon-panel shadow-2xl shadow-black/50"
        >
          {/* header */}
          <div className="flex h-11 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              <Shield className="h-4 w-4" style={{ color: "var(--anon-ok)" }} /> Key derivation explainer
            </h2>
            <button onClick={() => s.toggleCrypto()} className="anon-mut hover:anon-fg">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="anon-scroll flex-1 overflow-y-auto p-5 space-y-5">
            {/* explanation */}
            <div className="hairline bg-[var(--anon-bg)] p-4">
              <p className="anon-sans text-xs leading-relaxed anon-mut">
                anonshare derives <span className="anon-fg">two secrets</span> from your room code + password.
                Both use PBKDF2-SHA-256 at 600,000 rounds, but with{" "}
                <span className="anon-accent">different salts</span> — so the relay can&apos;t derive your
                encryption key even if it stores the auth hash.
              </p>
            </div>

            {/* inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="anon-mono mb-1 block text-[10px] uppercase tracking-wider anon-dim">
                  room code
                </label>
                <input
                  value={s.cryptoCode}
                  onChange={(e) => s.setCryptoCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="ABC123"
                  className="anon-mono w-full bg-[var(--anon-bg)] hairline px-3 py-2 text-center text-sm tracking-[0.3em] uppercase outline-none focus:border-[var(--anon-accent)]"
                />
              </div>
              <div>
                <label className="anon-mono mb-1 block text-[10px] uppercase tracking-wider anon-dim">
                  password (optional)
                </label>
                <input
                  value={s.cryptoPassword}
                  onChange={(e) => s.setCryptoPassword(e.target.value)}
                  type="password"
                  placeholder="••••••••"
                  className="anon-mono w-full bg-[var(--anon-bg)] hairline px-3 py-2 text-sm outline-none focus:border-[var(--anon-accent)]"
                />
              </div>
            </div>

            {/* derive button */}
            <button
              onClick={() => s.deriveKeys()}
              disabled={s.deriving || !s.cryptoCode.trim()}
              className="anon-mono inline-flex h-10 w-full items-center justify-center gap-2 bg-[var(--anon-accent)] text-sm font-medium text-[var(--anon-accent-fg)] disabled:opacity-50 hover:brightness-110"
            >
              {s.deriving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> deriving 100,000 PBKDF2 rounds…
                </>
              ) : (
                <>
                  <Key className="h-4 w-4" /> Derive keys (PBKDF2 · 100k rounds demo)
                </>
              )}
            </button>

            {/* result */}
            {r && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                {/* meta */}
                <div className="anon-mono flex items-center gap-3 text-[10px] anon-dim">
                  <span>{r.iterations.toLocaleString()} iterations</span>
                  <span>·</span>
                  <span>{r.durationMs}ms</span>
                  <span>·</span>
                  <span style={{ color: r.differentSalts ? "var(--anon-ok)" : "var(--anon-danger)" }}>
                    {r.differentSalts ? "✓ different salts" : "✗ same salt"}
                  </span>
                </div>

                {/* key */}
                <KeyRow
                  title="key (AES-GCM 256)"
                  icon={Lock}
                  color="var(--anon-accent)"
                  hex={r.key.hex}
                  salt={r.key.salt}
                  note={r.key.note}
                  badge="never sent"
                  onCopy={() => copy("key", r.key.fullHex)}
                  copied={copied === "key"}
                />

                {/* auth */}
                <KeyRow
                  title="auth token"
                  icon={Key}
                  color="var(--anon-warn)"
                  hex={r.auth.hex}
                  salt={r.auth.salt}
                  note={r.auth.note}
                  badge="sent to relay"
                  onCopy={() => copy("auth", r.auth.hex)}
                  copied={copied === "auth"}
                />

                {/* relay stored */}
                <div className="hairline bg-[var(--anon-bg)] p-4">
                  <div className="anon-mono mb-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider anon-dim">
                    <Shield className="h-3 w-3" style={{ color: "var(--anon-ok)" }} />
                    what the relay actually stores
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="anon-mono flex-1 break-all bg-[var(--anon-panel)] hairline px-2 py-1.5 text-[10px] anon-fg">
                      SHA-256(auth) = {r.relayStored.sha256OfAuth.slice(0, 64)}…
                    </code>
                    <button
                      onClick={() => copy("relay", r.relayStored.sha256OfAuth)}
                      className="anon-mono inline-flex h-8 w-8 flex-none items-center justify-center hairline anon-mut hover:bg-[var(--anon-raise)] hover:anon-fg"
                      title="Copy hash"
                    >
                      {copied === "relay" ? (
                        <Check className="h-3.5 w-3.5" style={{ color: "var(--anon-ok)" }} />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <p className="anon-sans mt-2 text-[11px] leading-relaxed anon-mut">
                    {r.relayStored.note}. The relay uses constant-time comparison
                    (<code className="anon-fg">constEq</code>) on every auth request.
                  </p>
                </div>

                {/* warning */}
                <div className="hairline bg-[var(--anon-bg)] p-3 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 flex-none mt-0.5" style={{ color: "var(--anon-warn)" }} />
                  <p className="anon-mono text-[10px] leading-relaxed anon-mut">
                    This demo uses 100k iterations so it returns in ~1s. Production uses{" "}
                    <span className="anon-fg">600,000 rounds</span>. Real anonshare runs this in your
                    browser&apos;s <code className="anon-fg">SubtleCrypto</code> — the key never leaves
                    the client. This server route exists only to <em>show the math</em>.
                  </p>
                </div>
              </motion.div>
            )}

            {/* flow diagram */}
            <div className="hairline bg-[var(--anon-bg)] p-4">
              <div className="anon-mono mb-3 text-[10px] uppercase tracking-wider anon-dim">the flow</div>
              <pre className="anon-mono text-[10px] leading-relaxed anon-mut overflow-x-auto">
{`input = "${s.cryptoCode || "CODE"}" + ":" + "${"*".repeat(s.cryptoPassword.length)}"

key  = PBKDF2(input, "anonshare|${s.cryptoCode}",       600k) → AES-GCM 256  [never sent]
auth = PBKDF2(input, "anonshare-auth|${s.cryptoCode}", 600k) → 32 bytes     [sent]

relay stores:  SHA-256(auth)  →  constEq(stored, incoming) on every request

╔══════════════════════════════════════════════════════╗
║  relay can NEVER derive the key from what it stores.  ║
║  different salts ⇒ different outputs ⇒ key ≠ auth.    ║
╚══════════════════════════════════════════════════════╝`}
              </pre>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function KeyRow({
  title,
  icon: Icon,
  color,
  hex,
  salt,
  note,
  badge,
  onCopy,
  copied,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  hex: string;
  salt: string;
  note: string;
  badge: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="hairline bg-[var(--anon-bg)] p-4">
      <div className="anon-mono mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider anon-dim">
        <Icon className="h-3 w-3" style={{ color }} />
        {title}
        <span className="ml-auto hairline px-1.5 py-0.5" style={{ color }}>
          {badge}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <code className="anon-mono flex-1 break-all bg-[var(--anon-panel)] hairline px-2 py-1.5 text-[10px] anon-fg">
          {hex}
        </code>
        <button
          onClick={onCopy}
          className="anon-mono inline-flex h-8 w-8 flex-none items-center justify-center hairline anon-mut hover:bg-[var(--anon-raise)] hover:anon-fg"
          title="Copy"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" style={{ color: "var(--anon-ok)" }} />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <div className="anon-mono mt-1.5 text-[10px] anon-dim">salt: {salt}</div>
      <p className="anon-sans mt-1 text-[11px] leading-snug anon-mut">{note}</p>
    </div>
  );
}
