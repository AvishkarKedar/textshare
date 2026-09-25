"use client";

import { useState, useMemo } from "react";
import { useAnon } from "@/lib/store";
import {
  HelpCircle,
  X,
  ChevronDown,
  Search,
  Shield,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export interface FaqItem {
  id: string;
  category: "security" | "rooms" | "runner" | "account" | "general";
  q: string;
  a: string;
}

export const FAQ_DATA: FaqItem[] = [
  /* ------------------------------ security ------------------------------ */
  {
    id: "e2e",
    category: "security",
    q: "Is it really end-to-end encrypted?",
    a: "Yes. The 6-character room code (plus optional room password) runs through PBKDF2-SHA256 at 600,000 rounds with two independent salts. One salt derives your AES-GCM-256 encryption key, which strictly never leaves your browser; the other derives an authentication token, of which the relay only ever stores the SHA-256 hash. Every document update, chat message, and file chunk is sealed with that key before it touches the network — the relay forwards opaque ciphertext and cannot read anything you write.",
  },
  {
    id: "relay-sees",
    category: "security",
    q: "What exactly does the server operator see?",
    a: "The relay sees: your IP address (used for rate limiting), the room code, connection timestamps, the size of encrypted blobs, and SHA-256(auth) for verification. It never sees your encryption key, your room password, the plaintext of any file, chat, or document. If the operator dumped the entire database, they would hold only ciphertext that would take billions of years to brute-force through PBKDF2 at 600k rounds.",
  },
  {
    id: "admin",
    category: "security",
    q: "Can server administrators decrypt or read room contents?",
    a: "No. Administrators can only see encrypted ciphertext blobs and can moderate abusive rooms (suspend or delete them), but cannot read any code, text, or files because the AES decryption key is never transmitted to any server. Administration uses a separate, rate-limited control surface — moderation rights are not decryption rights.",
  },
  {
    id: "password-strength",
    category: "security",
    q: "How strong should my room password be?",
    a: "A room with no password is protected by the 6-character code alone — 31 possible characters, roughly a 1-in-887-million guess, plus the code is unguessable (randomly generated, not word-based). Adding a password multiplies the search space enormously. For sensitive sessions, use a long passphrase (4+ random words); a short password like \"abc123\" adds little. Every wrong password attempt is limited to 8 per minute per IP to slow brute-forcing.",
  },

  /* -------------------------------- rooms ------------------------------- */
  {
    id: "ttl",
    category: "rooms",
    q: "What happens when everyone leaves a room?",
    a: "The relay tracks the last active timestamp. Once no one has been connected for the room's TTL — 10 minutes, 1 hour, or 24 hours, whichever the creator chose — the entire room (code, chat, files, history, and snapshots) is permanently erased from memory and disk. There is no recovery, no backup, no archive.",
  },
  {
    id: "owner",
    category: "rooms",
    q: "Can the room creator lock or delete the room?",
    a: "Yes. The creator holds a random 256-bit owner token (stored only in their browser) that grants lock, suspend, delete, and TTL-modification privileges. Locking makes the room read-only for everyone else; deleting purges the room for all participants instantly. If you lose the owner token there is no recovery — but the TTL still applies and the room will still erase itself.",
  },
  {
    id: "sharing-code",
    category: "rooms",
    q: "Is sharing the room code the same as sharing a password?",
    a: "Effectively, yes — anyone with the code (and password, if set) can join, read, and write. That is by design: the code IS the capability. Only share it over a channel you trust (an encrypted messenger, in person, or a known-good direct link). The invite link embeds the code, so treat links with the same care.",
  },
  {
    id: "rejoin",
    category: "rooms",
    q: "Can I rejoin a room after closing my tab?",
    a: "Yes, as long as the room's TTL hasn't expired and the room still has at least one connected peer or is within its grace window. Re-enter the same code (and password) from the landing page. Your encryption keys are re-derived locally from the code, so the full document history replays to you — but after the TTL passes, the room is gone for everyone, permanently.",
  },

  /* ------------------------------- runner ------------------------------- */
  {
    id: "runner",
    category: "runner",
    q: "How does the live code runner work, and is it sandboxed?",
    a: "Code executes on the operator's self-hosted relay inside a Bubblewrap-hardened Linux namespace: no network access, a 256 MB memory cap, an 8-second CPU timeout, read-only root filesystem, and a tmpfs scratchpad that is destroyed after each run. Eight languages run natively — JavaScript, Python, C, C++, Java, Rust, Go, and Bash. No third-party execution API is involved at any point.",
  },
  {
    id: "stdin",
    category: "runner",
    q: "How do I give my program input values (stdin)?",
    a: "Click Run (or press ⌘↵) — the terminal drawer opens below the editor with an INPUT box. Put one value per line (e.g. 3, then 4) and press Run; everything in the box is piped to your program's stdin. Python's input() reads one line per call, C's scanf reads space- or newline-separated values, C++'s cin reads one token at a time, and Java's Scanner behaves the same. The status bar shows an \"in: N\" indicator whenever input is ready.",
  },
  {
    id: "packages",
    category: "runner",
    q: "Which Python libraries are available on the runner?",
    a: "The full Python 3 standard library (math, json, sqlite3, re, datetime, random, …) plus a pre-bundled set: numpy, pandas, sympy, matplotlib (Agg backend), requests, BeautifulSoup (bs4), and pillow. The sandbox has no network access, so pip cannot install at run time — the bundle is built when the relay boots and is configurable by the operator (PY_BOOTSTRAP_PACKAGES). C/C++ compile with gcc/g++ 13 linking math and pthreads; Java ships its standard library.",
  },
  {
    id: "secrets",
    category: "runner",
    q: "Should I paste secrets or credentials into the runner?",
    a: "No. Even though the transport is end-to-end encrypted and the sandbox is hardened, pasted code exists in browser memory, may appear in local snapshots/history, and runs on infrastructure you don't control. Treat the runner like any shared machine: fine for algorithms and homework, wrong for API keys and private keys.",
  },

  /* ------------------------------- account ------------------------------ */
  {
    id: "account",
    category: "account",
    q: "Do I need an account, email, or cookies to use this?",
    a: "Never. There is no sign-up, no email, no tracking cookies, and no analytics. A random 256-bit owner token is kept in your browser's localStorage purely to remember your moderation rights for rooms you created — clear your browser storage and even that disappears. Preferences (theme, display name, font size) also live only in your browser.",
  },
  {
    id: "who",
    category: "account",
    q: "Who built this and why is it free?",
    a: "anonshare is an MIT-licensed open-source project. The full stack — client, relay, sandbox, and admin tools — is in the public repository, so anyone can audit the crypto or self-host the entire service. The hosted instance exists to make the zero-friction experience available out of the box.",
  },

  /* ------------------------------- general ------------------------------ */
  {
    id: "limits",
    category: "general",
    q: "What are the rate limits and room capacity?",
    a: "Each IP is throttled to 300 requests/minute by default, 20 room creations/minute, and 8 password attempts/minute. A single room supports up to 60 concurrent collaborators; beyond that, new joins receive a 429. Runs are capped at 20 per minute per IP. These limits exist to keep the free relay abuse-resistant, not to meter you.",
  },
  {
    id: "p2p",
    category: "general",
    q: "How does real-time collaboration actually sync?",
    a: "Edits sync over a binary WebSocket protocol using CRDTs (Yjs) inside an end-to-end-encrypted envelope, so concurrent edits from many peers converge deterministically without a central authority. Presence, cursors, typing indicators, and chat ride the same encrypted channel. The relay is a dumb, blind forwarder of sealed bytes.",
  },
  {
    id: "browser-support",
    category: "general",
    q: "Which browsers work best?",
    a: "Any modern browser with WebCrypto (Chrome, Edge, Firefox, Safari — including mobile Safari and Chrome on Android). The encryption, cursor sync, and code execution all run on standard web APIs with no plugins. For best results on desktop, keep the browser updated; on mobile, the layout is touch-optimized with a run button in the bottom bar.",
  },
  {
    id: "selfhost",
    category: "general",
    q: "Can I self-host it?",
    a: "Yes — everything is open source. The relay (Node.js, including the sandboxed runner) and the static client are both in the repository with deployment guides. Room keys are derived locally from your code, so even a relay you don't trust cannot read your content; the README walks through the full setup.",
  },
];

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "security", label: "Security" },
  { id: "rooms", label: "Rooms" },
  { id: "runner", label: "Runner" },
  { id: "account", label: "No account" },
  { id: "general", label: "General" },
];

export function FaqModal() {
  const open = useAnon((s) => s.faqOpen);
  const toggleFaq = useAnon((s) => s.toggleFaq);
  const toggleSecurity = useAnon((s) => s.toggleSecurity);

  const [query, setQuery] = useState("");
  const [selectedCat, setSelectedCat] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>("e2e");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return FAQ_DATA.filter((item) => {
      const matchCat = selectedCat === "all" || item.category === selectedCat;
      const qLower = query.toLowerCase().trim();
      if (!qLower) return matchCat;
      const matchSearch =
        item.q.toLowerCase().includes(qLower) ||
        item.a.toLowerCase().includes(qLower);
      return matchCat && matchSearch;
    });
  }, [query, selectedCat]);

  const copyAnswer = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Answer copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Frequently Asked Questions"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={() => toggleFaq()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col hairline anon-panel anon-fg shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 hairline-b anon-raise">
          <div className="flex items-center gap-2.5">
            <HelpCircle className="h-5 w-5 anon-accent" />
            <div>
              <h2 className="anon-sans text-base font-semibold">
                Frequently asked questions
              </h2>
              <p className="anon-mono text-[11px] anon-mut">
                {FAQ_DATA.length} honest answers — encryption, privacy, TTL, and the sandbox.
              </p>
            </div>
          </div>
          <button
            onClick={() => toggleFaq()}
            className="anon-mut hover:anon-fg p-1.5 hairline hover:bg-[var(--anon-raise)] transition-colors"
            title="Close (Esc)"
            aria-label="Close FAQ"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="anon-raise space-y-3 p-4 hairline-b">
          <div className="relative">
            <Search className="anon-dim absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search (encryption, password, timeout, admin…)"
              className="anon-mono anon-fg w-full py-2 pl-9 pr-8 text-xs hairline bg-[var(--anon-panel)] focus:outline-none focus:border-[var(--anon-accent)]"
              autoFocus
              aria-label="Search FAQ"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="anon-dim hover:anon-fg absolute right-2.5 top-1/2 -translate-y-1/2 text-xs"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCat(cat.id)}
                className={`anon-mono hairline px-2.5 py-1 text-[11px] transition-colors ${
                  selectedCat === cat.id
                    ? "bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] border-[var(--anon-accent)]"
                    : "anon-mut hover:anon-fg bg-[var(--anon-panel)] hover:border-[var(--anon-line2)]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Questions Accordion List */}
        <div className="anon-scroll flex-1 space-y-2 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="anon-mono anon-dim text-xs">No matching questions found.</p>
              <button
                onClick={() => { setQuery(""); setSelectedCat("all"); }}
                className="anon-accent hover:anon-fg anon-mono mt-2 text-xs hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : (
            filtered.map((item) => {
              const isOpen = expandedId === item.id;
              const isCopied = copiedId === item.id;
              return (
                <div
                  key={item.id}
                  className="hairline anon-raise transition-colors hover:border-[var(--anon-line2)]"
                >
                  <button
                    onClick={() => setExpandedId(isOpen ? null : item.id)}
                    className="flex w-full items-center justify-between p-3.5 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="anon-sans anon-fg pr-3 text-xs font-medium sm:text-sm">
                      {item.q}
                    </span>
                    <ChevronDown
                      className={`anon-mut h-4 w-4 flex-none transition-transform duration-200 ${
                        isOpen ? "anon-accent rotate-180" : ""
                      }`}
                    />
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden px-3.5 pb-3.5 pt-1"
                      >
                        <p className="anon-sans anon-mut max-w-xl text-xs leading-relaxed">
                          {item.a}
                        </p>
                        <div className="anon-mut mt-3 flex items-center justify-between pt-2.5 hairline-t">
                          <span className="anon-accent anon-mono text-[10px] uppercase tracking-wider">
                            {item.category}
                          </span>
                          <button
                            onClick={() => copyAnswer(item.id, `${item.q}\n\n${item.a}`)}
                            className="anon-mut hover:anon-fg anon-mono inline-flex items-center gap-1 text-[10px] transition-colors"
                            title="Copy question and answer"
                          >
                            {isCopied ? (
                              <>
                                <Check className="h-3 w-3" style={{ color: "var(--anon-ok)" }} /> Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" /> Copy answer
                              </>
                            )}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="anon-mut flex items-center justify-between px-5 py-3 hairline-t anon-raise">
          <div className="flex items-center gap-1.5 text-xs">
            <Shield className="h-3.5 w-3.5" style={{ color: "var(--anon-ok)" }} />
            <span className="anon-mono text-[11px]">Zero tracking · AES-GCM-256 · PBKDF2 600k</span>
          </div>
          <button
            onClick={() => {
              toggleFaq();
              setTimeout(() => toggleSecurity(), 150);
            }}
            className="anon-accent hover:anon-fg anon-mono inline-flex items-center gap-1 text-[11px] hover:underline"
          >
            Threat model write-up <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
