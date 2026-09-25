"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Shield,
  Lock,
  Key,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Server,
  Fingerprint,
  Database,
} from "lucide-react";
import { useAnon } from "@/lib/store";

export function SecurityModal() {
  const s = useAnon();
  if (!s.securityOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={() => s.toggleSecurity()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[88vh] w-full max-w-3xl flex-col hairline anon-panel shadow-2xl shadow-black/60"
        >
          {/* header */}
          <div className="flex h-11 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              <Shield className="h-4 w-4" style={{ color: "var(--anon-ok)" }} /> Threat model
            </h2>
            <span className="anon-mono text-[10px] anon-dim hidden sm:inline">honest about what we can and can&apos;t do</span>
            <button onClick={() => s.toggleSecurity()} className="anon-mut hover:anon-fg">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="anon-scroll flex-1 overflow-y-auto p-5 space-y-5">
            {/* intro */}
            <div className="hairline bg-[var(--anon-bg)] p-4">
              <p className="anon-sans text-xs leading-relaxed anon-mut">
                anonshare is end-to-end encrypted. The relay forwards opaque ciphertext — it cannot read your code,
                chat, or files. But no system is perfect. Here&apos;s an honest look at what we protect, what we
                don&apos;t, and the known limits.
              </p>
            </div>

            {/* what we protect */}
            <div>
              <h3 className="anon-mono mb-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--anon-ok)" }}>
                <CheckCircle2 className="h-3 w-3" /> what we protect
              </h3>
              <div className="space-y-2">
                <ProtectRow icon={Key} title="Encryption key never leaves your browser" body="PBKDF2-SHA-256 (600k rounds) derives your AES-GCM 256 key from the room code + password. The key is used in SubtleCrypto — it never touches the network." color="var(--anon-ok)" />
                <ProtectRow icon={Fingerprint} title="Relay stores only SHA-256(auth)" body="The auth token is derived with a DIFFERENT salt than the key. The relay persists only its SHA-256 hash, compared with constant-time constEq() on every request." color="var(--anon-ok)" />
                <ProtectRow icon={Database} title="No persistence after expiry" body="When the last peer leaves, the room self-destructs after the TTL (10m/1h/24h). Code, chat, files, history — all erased from the relay's storage with no backup." color="var(--anon-ok)" />
                <ProtectRow icon={Lock} title="No account, no email, no cookies" body="Identity is a single owner token in localStorage. Clear your browser storage and it's gone. The relay only sees your IP for rate-limiting (60s window)." color="var(--anon-ok)" />
              </div>
            </div>

            {/* what the relay sees */}
            <div>
              <h3 className="anon-mono mb-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--anon-accent)" }}>
                <Eye className="h-3 w-3" /> what the relay sees
              </h3>
              <div className="hairline bg-[var(--anon-bg)] p-4">
                <div className="anon-mono space-y-1.5 text-[11px]">
                  <div className="flex items-center gap-2"><span className="anon-dim">·</span> <span className="anon-fg">your IP address</span> <span className="anon-dim">(rate-limiting, 60s)</span></div>
                  <div className="flex items-center gap-2"><span className="anon-dim">·</span> <span className="anon-fg">SHA-256(auth)</span> <span className="anon-dim">(for auth comparison)</span></div>
                  <div className="flex items-center gap-2"><span className="anon-dim">·</span> <span className="anon-fg">encrypted bytes</span> <span className="anon-dim">(opaque ciphertext)</span></div>
                  <div className="flex items-center gap-2"><span className="anon-dim">·</span> <span className="anon-fg">room code</span> <span className="anon-dim">(in the URL path)</span></div>
                  <div className="flex items-center gap-2"><span className="anon-dim">·</span> <span className="anon-fg">message timestamps + sizes</span></div>
                </div>
              </div>
            </div>

            {/* known limits */}
            <div>
              <h3 className="anon-mono mb-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--anon-warn)" }}>
                <AlertTriangle className="h-3 w-3" /> known limits (honest)
              </h3>
              <div className="space-y-2">
                <LimitRow body="Traffic analysis: the relay can see message timing and sizes. It cannot read content, but metadata reveals patterns. Use a password to at least prevent trivial correlation." />
                <LimitRow body="Weak room codes: 6 characters from a 32-char alphabet = ~31 bits of entropy. Bruteforce is rate-limited (20 creates/min, 8 auth/min per IP) but not impossible. Use a password for anything sensitive." />
                <LimitRow body="Code runner: executes only on the operator's self-hosted relay inside a real Bubblewrap sandbox (--unshare-all --unshare-net, prlimit caps). No external code-execution API is used. Don't paste secrets regardless." />
                <LimitRow body="X-Frame-Options: some sites (Google, MDN) block embedding, so the in-app browser can't load them. Click the open-in-new-tab icon instead." />
                <LimitRow body="No forward secrecy: if your room code + password are ever compromised, all historical messages (within the TTL) can be decrypted. Rotate by creating a new room." />
              </div>
            </div>

            {/* crypto flow */}
            <div className="hairline bg-[var(--anon-bg)] p-4">
              <div className="anon-mono mb-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider anon-dim">
                <Key className="h-3 w-3" /> crypto flow
              </div>
              <pre className="anon-mono text-[10px] leading-relaxed anon-mut overflow-x-auto">
{`input  = roomCode + ":" + password

key    = PBKDF2(input, salt = "textshare|CODE",        600_000) → AES-GCM 256   [never sent]
auth   = PBKDF2(input, salt = "textshare-auth|CODE",   600_000) → 32 bytes      [sent to relay]

relay stores:  SHA-256(auth)
relay compares:  constEq(stored, incoming)  on every request

╔═══════════════════════════════════════════════════╗
║  different salts ⇒ key ≠ auth ⇒ relay can't        ║
║  derive the encryption key from what it stores.     ║
╚═══════════════════════════════════════════════════╝`}
              </pre>
            </div>

            {/* admin scope */}
            <div className="hairline bg-[var(--anon-bg)] p-4 flex items-start gap-2">
              <Server className="h-3.5 w-3.5 flex-none mt-0.5 anon-mut" />
              <p className="anon-mono text-[10px] leading-relaxed anon-mut">
                <span className="anon-fg">Admin scope:</span> admins can suspend, lock, or delete rooms
                (moderation only). They <span className="anon-fg">cannot</span> decrypt contents — they
                don&apos;t have the AES key. The auth token they could see is only a SHA-256 hash. Admin
                login is rate-limited (8/min) and fail-closed if the secret is unset.
              </p>
            </div>
          </div>

          <div className="hairline-t px-3 py-1.5 anon-mono text-[10px] anon-dim flex items-center justify-between">
            <span className="inline-flex items-center gap-1">
              <EyeOff className="h-2.5 w-2.5" /> no telemetry · no analytics · no tracking
            </span>
            <span>threat model · MIT-licensed project</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ProtectRow({
  icon: Icon,
  title,
  body,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  body: string;
  color: string;
}) {
  return (
    <div className="flex items-start gap-2.5 hairline bg-[var(--anon-bg)] p-3">
      <Icon className="h-4 w-4 flex-none mt-0.5" style={{ color }} />
      <div>
        <div className="anon-sans text-xs font-medium anon-fg">{title}</div>
        <p className="anon-sans mt-0.5 text-[11px] leading-relaxed anon-mut">{body}</p>
      </div>
    </div>
  );
}

function LimitRow({ body }: { body: string }) {
  return (
    <div className="flex items-start gap-2 hairline bg-[var(--anon-bg)] p-3">
      <AlertTriangle className="h-3 w-3 flex-none mt-0.5" style={{ color: "var(--anon-warn)" }} />
      <p className="anon-sans text-[11px] leading-relaxed anon-mut">{body}</p>
    </div>
  );
}
