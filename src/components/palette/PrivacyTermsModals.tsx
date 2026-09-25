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

/* ------------------------------------------------------------------ */
/* Privacy Policy                                                      */
/* ------------------------------------------------------------------ */

const PRIVACY_SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. Summary",
    body: (
      <p>
        anonshare is a zero-knowledge, end-to-end-encrypted collaboration service. We designed the
        product so that there is nothing personal to collect: no account, no email, no phone number,
        no profile, and no analytics. This policy explains, in plain language, exactly what data
        exists, where it lives, and when it disappears. The short version: your content is encrypted
        in your browser before it ever leaves your device, the relay that forwards it cannot read
        it, and everything is destroyed when your room&apos;s time-to-live (TTL) expires.
      </p>
    ),
  },
  {
    title: "2. Data we process on the relay",
    body: (
      <>
        <p>The relay processes the following, strictly to make the service function:</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li><b>IP address</b> — for per-IP rate limiting (throttling counters, kept in memory only).</li>
          <li><b>Room code</b> — the 6-character identifier, so peers can find the same room.</li>
          <li><b>SHA-256(auth)</b> — a one-way hash of your derived authentication token, used to verify you without knowing the token itself.</li>
          <li><b>Encrypted payload bytes</b> — sealed AES-GCM-256 ciphertext. The relay stores and forwards these but cannot decrypt them; the key never leaves your browser.</li>
          <li><b>Encrypted file chunks</b> — up to 25 MB per file, sealed with the same room key.</li>
          <li><b>Room metadata</b> — creation time, chosen TTL, peer count, and connection timestamps.</li>
        </ul>
        <p className="mt-2">
          That is the complete list. The relay holds no usernames, no identifiers that persist
          across rooms, and no plaintext of any kind.
        </p>
      </>
    ),
  },
  {
    title: "3. Data that stays in your browser",
    body: (
      <>
        <p>Several values are generated and stored locally and are never transmitted to us:</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li><b>Encryption key</b> — AES-GCM-256, derived from your room code (plus optional password) via PBKDF2-SHA256 at 600,000 rounds.</li>
          <li><b>Auth token</b> — the pre-hash token itself; the relay only ever receives requests authenticated by knowledge of it.</li>
          <li><b>Owner token</b> — a random 256-bit value granting room administration (lock, delete, TTL). If you clear browser storage, it is gone and cannot be recovered.</li>
          <li><b>Preferences</b> — theme, display name, color, font size, and keybindings, kept in localStorage under <code>&quot;anonshare-prefs-v5&quot;</code>.</li>
        </ul>
      </>
    ),
  },
  {
    title: "4. Data deletion and retention",
    body: (
      <p>
        Every room has a TTL of 10 minutes, 1 hour, or 24 hours, chosen by its creator. The timer
        starts when the <i>last</i> participant disconnects. On expiry, the relay permanently erases
        the room and everything in it: document history, chat, file chunks, metadata, and the
        hashed auth value. This is automatic, irreversible, and applies to every room with no
        exceptions. A room owner can also delete a room instantly, which purges the same data
        immediately for all participants. We do not maintain backups of room content; deletion
        means deletion.
      </p>
    ),
  },
  {
    title: "5. Cookies and tracking",
    body: (
      <p>
        anonshare sets no cookies and runs no analytics, telemetry, fingerprinting, advertising
        pixels, or third-party trackers. There is nothing to opt out of because nothing is
        collected. We do not know who you are, and the system is built so that we cannot find out.
      </p>
    ),
  },
  {
    title: "6. Local storage details",
    body: (
      <p>
        The only browser storage we use is localStorage (preferences and per-room owner tokens, as
        listed in section 3). If you enable offline persistence features, document snapshots may
        also be cached locally so you can review them after a disconnect — these never leave your
        device. Clearing your browser data at any time removes every trace of anonshare from your
        machine.
      </p>
    ),
  },
  {
    title: "7. The code runner",
    body: (
      <p>
        When you press Run, your active file is sent — inside the same encrypted session — to the
        relay&apos;s sandbox, where it executes in a Bubblewrap-sealed Linux namespace with no
        network access, a 256 MB memory cap, and an 8-second timeout. The scratchpad used for
        execution is destroyed after each run. Run outputs return to every room participant over
        the encrypted channel. The relay keeps a short-lived rate-limit counter (runs per IP per
        minute) but does not log the code that was executed.
      </p>
    ),
  },
  {
    title: "8. Third parties",
    body: (
      <p>
        The hosted service at code.avishkark.in is served through Cloudflare Pages (static asset
        delivery) and the operator&apos;s own relay server. Cloudflare processes standard request
        metadata (IP, TLS handshake) as part of CDN delivery. No other third party receives your
        data — there are no external APIs in the request path for collaboration, chat, or
        execution. The project is open source, so every component can be audited or self-hosted.
      </p>
    ),
  },
  {
    title: "9. Children",
    body: (
      <p>
        anonshare is not directed at children under 13, and we do not knowingly collect personal
        information from anyone. Because there is no account system and no data retention beyond
        the TTL, any data created by a minor is erased automatically within 24 hours at most.
      </p>
    ),
  },
  {
    title: "10. Your rights",
    body: (
      <p>
        Under regulations such as GDPR and CCPA you have rights to access, delete, and export
        personal data. For anonshare, exercising these rights is direct and technical rather than
        bureaucratic: leave the room to stop sharing; wait for the TTL (or ask the owner to delete
        the room) and all server-side data is gone; clear your browser storage and all local data
        is gone. Because we cannot decrypt or attribute rooms to individuals, we cannot produce
        content on request — the encryption that protects you also prevents us from complying
        with over-broad requests. If you believe the relay holds data covered by a deletion right,
        contact the operator and the room(s) will be purged.
      </p>
    ),
  },
  {
    title: "11. International transfers",
    body: (
      <p>
        The relay operates on a single self-hosted server. Depending on its physical location, your
        encrypted traffic may transit other jurisdictions via normal internet routing and
        Cloudflare&apos;s CDN. Since all payload content is end-to-end encrypted, any party in the
        path only ever sees ciphertext.
      </p>
    ),
  },
  {
    title: "12. Security of the service itself",
    body: (
      <p>
        Room security rests on PBKDF2-SHA256 (600k rounds) key derivation, AES-GCM-256 sealing,
        per-IP throttling, and hashed authentication tokens. For the honest limits of this model —
        including what a malicious relay could still learn from traffic timing and sizes — see the
        in-app threat model (Security → Threat model). We encourage reviewing the open-source
        implementation rather than trusting this document alone.
      </p>
    ),
  },
  {
    title: "13. Changes to this policy",
    body: (
      <p>
        If this policy changes, the updated version ships with the next release of the app and is
        dated accordingly. Because there is no account, there is no one to notify individually;
        since we collect nothing, material changes to collection would in any case mean the
        architecture itself changed — which would be visible in the open-source repository.
      </p>
    ),
  },
];

/* ------------------------------------------------------------------ */
/* Terms of Service                                                    */
/* ------------------------------------------------------------------ */

const TERMS_SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. Acceptance of terms",
    body: (
      <p>
        By creating or joining a room on the hosted anonshare service, you agree to these terms.
        If you do not agree, do not use the service. There is no account to bind you, so leaving
        — closing the tab and letting the TTL expire — is the same as revoking acceptance.
      </p>
    ),
  },
  {
    title: "2. What the service is",
    body: (
      <p>
        anonshare is a live, end-to-end-encrypted collaborative editor and code runner. We forward
        encrypted bytes between participants, store them temporarily per the room&apos;s TTL, and
        execute code you explicitly submit in a hardened sandbox. We cannot read your content and
        claim no license over it: your code and text remain entirely yours.
      </p>
    ),
  },
  {
    title: "3. Eligibility",
    body: (
      <p>
        The service is offered to anyone with a modern browser. It is not directed at children
        under 13. If you use it on behalf of an organization, you confirm you have authority to
        accept these terms for that organization.
      </p>
    ),
  },
  {
    title: "4. Acceptable use",
    body: (
      <>
        <p>Do not use anonshare to:</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>distribute malware, phishing pages, or other malicious code;</li>
          <li>harass, threaten, or defame individuals or groups;</li>
          <li>share content you do not have the rights to share;</li>
          <li>violate applicable law in your jurisdiction or the relay operator&apos;s;</li>
          <li>attempt to disrupt, overload, or circumvent the relay&apos;s rate limits or sandbox.</li>
        </ul>
        <p className="mt-2">
          Rooms can be reported and suspended by the operator. Moderation is metadata-only —
          administrators can suspend or delete rooms but cannot read their contents, because they
          do not hold the key. Suspensions are reversible; deletions are not.
        </p>
      </>
    ),
  },
  {
    title: "5. Rooms are ephemeral",
    body: (
      <p>
        Every room self-destructs. The TTL (10 minutes, 1 hour, or 24 hours after the last
        participant leaves) is a core design feature, not a setting we may extend for you. There
        is no recovery, no backup, and no archive. If content matters to you, export it (⌘⇧E
        downloads a ZIP) before the room expires. Do not treat anonshare as durable storage.
      </p>
    ),
  },
  {
    title: "6. Room codes and owner tokens",
    body: (
      <p>
        The 6-character room code (plus optional password) is the complete access credential:
        anyone who has it can join, read, and (unless the room is locked) edit. Share it only
        over channels you trust. The owner token that grants administration lives only in the
        creator&apos;s browser; losing it means losing administrative control, though the TTL
        still applies.
      </p>
    ),
  },
  {
    title: "7. The code runner — use at your own judgment",
    body: (
      <p>
        Code execution happens in a sandbox, but no sandbox is perfect, and the runner runs on
        infrastructure you do not control. Do not submit secrets, credentials, private keys, or
        confidential data. Runs are rate-limited per IP and time-capped. We may adjust supported
        languages, packages, and resource limits at any time to keep the service stable.
      </p>
    ),
  },
  {
    title: "8. No warranty",
    body: (
      <p>
        The service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties
        of any kind, express or implied, including merchantability, fitness for a particular
        purpose, and non-infringement. We do not promise uninterrupted availability, data
        retention beyond the TTL, or fitness for any specific task. Cryptography, like all
        software, may contain bugs; review the source and self-host if your threat model demands
        independence.
      </p>
    ),
  },
  {
    title: "9. Limitation of liability",
    body: (
      <p>
        To the maximum extent permitted by law, the operators&apos; aggregate liability for any
        claim arising from use of the service is limited to zero dollars. We are a free,
        MIT-licensed project. Your recourse for problems is to open an issue on GitHub or stop
        using the service.
      </p>
    ),
  },
  {
    title: "10. Intellectual property",
    body: (
      <p>
        Content you create in a room is yours — we never take a license to it beyond the technical
        necessity of forwarding and briefly storing its encrypted form. The anonshare source code
        is MIT-licensed; the name and logo belong to the project maintainers.
      </p>
    ),
  },
  {
    title: "11. Termination and access",
    body: (
      <p>
        Leaving stops sync for you immediately. The TTL erases everything within 24 hours at the
        latest. We may suspend or delete rooms for abuse or to protect the service, and we may
        rate-limit or block addresses that attack the infrastructure. Because there are no
        accounts, there are no account-level terminations.
      </p>
    ),
  },
  {
    title: "12. Self-hosting",
    body: (
      <p>
        The entire stack — client, relay, sandbox, and admin tools — is open source under the MIT
        license. If the hosted instance disappears or you prefer independence, you can run your
        own; the repository contains deployment instructions. Your keys are derived locally, so a
        self-hosted relay serves your rooms without gaining the ability to read them.
      </p>
    ),
  },
  {
    title: "13. Changes to these terms",
    body: (
      <p>
        These terms may be updated as the service evolves. The current version always ships with
        the app and is dated in its footer. Continued use after an update constitutes acceptance.
        Fundamental architectural promises — no accounts, no tracking, end-to-end encryption,
        TTL deletion — are part of the project&apos;s identity and will not be quietly removed.
      </p>
    ),
  },
];

/* ------------------------------------------------------------------ */
/* Shared modal shell                                                  */
/* ------------------------------------------------------------------ */

function LegalModal({
  open,
  onClose,
  icon,
  title,
  subtitle,
  fileLabel,
  sections,
}: {
  open: boolean;
  onClose: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  fileLabel: string;
  sections: { title: string; body: React.ReactNode }[];
}) {
  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="anon-panel anon-fg flex max-h-[85vh] w-full max-w-2xl flex-col shadow-2xl shadow-black/60 hairline"
        >
          <div className="flex h-11 items-center justify-between px-4 hairline-b">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              {icon} {title}
            </h2>
            <button onClick={onClose} className="anon-mut hover:anon-fg" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="anon-scroll flex-1 space-y-5 overflow-y-auto p-5 anon-sans text-sm leading-relaxed anon-mut">
            <p className="anon-fg font-medium">{subtitle}</p>
            {sections.map((s) => (
              <section key={s.title}>
                <h3 className="anon-fg anon-sans mb-1.5 text-xs font-semibold uppercase tracking-wider">
                  {s.title}
                </h3>
                {s.body}
              </section>
            ))}
          </div>
          <div className="anon-mut anon-mono flex items-center justify-between px-3 py-1.5 text-[10px] hairline-t">
            <span>{fileLabel} · MIT-licensed project</span>
            <span>last updated: v5.4</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function PrivacyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <LegalModal
      open={open}
      onClose={onClose}
      icon={<Shield className="h-4 w-4 anon-accent" />}
      title="Privacy policy"
      subtitle="The short version: no accounts, no cookies, no analytics. Your content is encrypted in your browser, the relay can't read it, and everything erases itself."
      fileLabel="privacy"
      sections={PRIVACY_SECTIONS}
    />
  );
}

function TermsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <LegalModal
      open={open}
      onClose={onClose}
      icon={<FileText className="h-4 w-4 anon-accent" />}
      title="Terms of service"
      subtitle="The short version: rooms are ephemeral by design, your content stays yours, don't abuse the sandbox, and the service comes with no warranty."
      fileLabel="terms"
      sections={TERMS_SECTIONS}
    />
  );
}
