"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Shield, FileText } from "lucide-react";
import { useAnon } from "@/lib/store";

export function PrivacyTermsModals() {
  const s = useAnon();
  return (
    <>
      <PrivacyModal open={s.privacyOpen} onClose={() => s.togglePrivacy()} />
      <TermsModal open={s.termsOpen} onClose={() => s.toggleTerms()} />
    </>
  );
}

function PrivacyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[85vh] w-full max-w-2xl flex-col hairline anon-panel shadow-2xl shadow-black/60"
        >
          <div className="flex h-11 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              <Shield className="h-4 w-4 anon-accent" /> Privacy policy
            </h2>
            <button onClick={onClose} className="anon-mut hover:anon-fg"><X className="h-4 w-4" /></button>
          </div>
          <div className="anon-scroll flex-1 overflow-y-auto p-5 space-y-4 anon-sans text-sm leading-relaxed anon-mut">
            <Section title="What we collect">
              <p>Almost nothing. anonshare stores no email, no name, no account. The relay sees your IP address for rate-limiting (60-second window) and persists only <code className="anon-fg">SHA-256(auth)</code> — never the auth token itself, never your encryption key.</p>
            </Section>
            <Section title="What stays in your browser">
              <p>Your AES-GCM 256 key (derived via PBKDF2 from the room code + password), your owner token (a 256-bit random value in localStorage), your display name, your color, and your theme preferences. None of these are sent to the relay.</p>
            </Section>
            <Section title="What the relay stores">
              <p>Per room: the encrypted message log (opaque ciphertext, max 5MB), encrypted file chunks (max 5MB each), the room code, created timestamp, TTL, and <code className="anon-fg">SHA-256(auth)</code>. When the last peer disconnects, a timer starts; when it expires (10m/1h/24h), everything is erased.</p>
            </Section>
            <Section title="Cookies & tracking">
              <p>None. We use localStorage for preferences (theme, name, color, recents) and IndexedDB for an offline copy of your room contents (if you enable it). No analytics, no telemetry, no third-party trackers.</p>
            </Section>
            <Section title="Your rights">
              <p>Close the tab and the room stops syncing. Wait for the TTL and it&apos;s gone. Clear your browser storage and your owner token is gone (the room keeps living until its TTL expires). There is no &quot;account to delete&quot; because there is no account.</p>
            </Section>
            <Section title="Children">
              <p>anonshare is not directed at children under 13. We don&apos;t knowingly collect information from anyone. If you believe a minor has used the service, the TTL will erase their data within 24h at most.</p>
            </Section>
            <Section title="Changes">
              <p>If we change this policy, the updated version appears here. Since we store no account, there&apos;s no one to notify individually — check back if it matters to you.</p>
            </Section>
          </div>
          <div className="hairline-t px-3 py-1.5 anon-mono text-[10px] anon-dim flex items-center justify-between">
            <span>privacy.html · MIT licensed</span>
            <span>last updated: v5.1</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function TermsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[85vh] w-full max-w-2xl flex-col hairline anon-panel shadow-2xl shadow-black/60"
        >
          <div className="flex h-11 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 anon-accent" /> Terms of service
            </h2>
            <button onClick={onClose} className="anon-mut hover:anon-fg"><X className="h-4 w-4" /></button>
          </div>
          <div className="anon-scroll flex-1 overflow-y-auto p-5 space-y-4 anon-sans text-sm leading-relaxed anon-mut">
            <Section title="Acceptance">
              <p>By opening a room, you agree to these terms. If you don&apos;t, don&apos;t open a room. There&apos;s no account to bind you, so closing the tab is the same as revoking acceptance.</p>
            </Section>
            <Section title="The service">
              <p>anonshare is a live, end-to-end-encrypted collaborative editor. We forward encrypted bytes between peers and store them briefly (per the TTL). We cannot read your content. We don&apos;t claim any rights to it.</p>
            </Section>
            <Section title="Acceptable use">
              <p>Don&apos;t use it for: spam, malware distribution, abuse, harassment, or anything illegal in your jurisdiction. Rooms can be reported and suspended by an admin — but admins can&apos;t read content (they only see metadata). Suspensions are reversible; deletes are not.</p>
            </Section>
            <Section title="No warranty">
              <p>The service is provided &quot;as is&quot;. We don&apos;t guarantee uptime, data retention beyond the TTL, or fitness for any particular purpose. Use at your own risk. Don&apos;t paste secrets into the public runner.</p>
            </Section>
            <Section title="Liability">
              <p>Our liability is capped at $0. We&apos;re a free, MIT-licensed project. If something breaks, your recourse is to open an issue on GitHub.</p>
            </Section>
            <Section title="Self-hosting">
              <p>The entire stack is open source. If our relay vanishes, you can run your own — the README explains how. Your keys are derived locally, so even a malicious relay can&apos;t read your content.</p>
            </Section>
            <Section title="Termination">
              <p>Leave the room and it stops syncing for you. The TTL erases everything within 24h. We can also delete rooms for abuse, but that&apos;s moderation — not your data.</p>
            </Section>
          </div>
          <div className="hairline-t px-3 py-1.5 anon-mono text-[10px] anon-dim flex items-center justify-between">
            <span>terms.html · MIT licensed</span>
            <span>last updated: v5.1</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="anon-sans mb-1 text-xs font-semibold uppercase tracking-wider anon-fg">{title}</h3>
      {children}
    </div>
  );
}
