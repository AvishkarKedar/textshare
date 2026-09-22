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
  {
    id: "e2e",
    category: "security",
    q: "Is it really end-to-end encrypted?",
    a: "Yes. The 6-character room code (plus optional room password) runs through PBKDF2-SHA256 at 600,000 rounds with two independent salts. One salt derives your AES-GCM 256 encryption key (which strictly never leaves your browser), and the other derives an authentication token (the relay only stores the SHA-256 hash of it). The relay forwards opaque ciphertext; it cannot read your code or messages.",
  },
  {
    id: "ttl",
    category: "rooms",
    q: "What happens when everyone leaves a room?",
    a: "The room's Durable Object tracks the last active timestamp. Once no one has been connected for 10 minutes, 1 hour, or 24 hours (whichever TTL the creator chose), the entire room — code, chat, files, and snapshots — is permanently erased from memory and disk. There is no recovery or backup.",
  },
  {
    id: "account",
    category: "account",
    q: "Do I need an account or email to use this?",
    a: "Never. No email, no password registration, no tracking cookies. A random 256-bit room owner token is stored locally in your browser to give you room administrative privileges (lock, change TTL, delete). Clear your browser cache and the token is gone — the room lives on until its TTL expires.",
  },
  {
    id: "runner",
    category: "runner",
    q: "How does the live code runner work and is it safe?",
    a: "On the hosted Oracle VPS relay, code runs inside a Bubblewrap-hardened Linux namespace with no network access, a 256 MB RAM cap, 5-second timeout, and read-only root with tmpfs scratchpad. Languages supported include JavaScript, Python, C, C++, Java, Rust, Go, and Bash.",
  },
  {
    id: "stdin",
    category: "runner",
    q: "How do I give my program input values?",
    a: "Open the terminal (Run button or ⌘↵) — below the output there is an INPUT box. Type one value per line (e.g. 3, then 4) and press Run: everything in that box is piped to your program's stdin. Python's input() reads one line per call, C's scanf(\"%d %d\") accepts space- or newline-separated values, C++'s cin >> x reads one token per line, and Java's Scanner works the same way. The status bar shows an 'in: N' indicator whenever input is ready, and the terminal prints how many lines were piped on each run.",
  },
  {
    id: "packages",
    category: "runner",
    q: "Which Python libraries are available on the runner?",
    a: "The full Python 3 standard library (math, json, sqlite3, re, datetime, random, …) plus a pre-bundled popular set: numpy, pandas, sympy, matplotlib (Agg backend), requests, bs4 (BeautifulSoup) and pillow. The sandbox has no network access, so pip install cannot run at execution time — the bundle is installed at relay boot instead. The relay owner can extend the set with the PY_BOOTSTRAP_PACKAGES environment variable. C and C++ compile with gcc/g++ 13 (math, pthread, and the full standard library are linked); Java ships its standard library.",
  },
  {
    id: "owner",
    category: "rooms",
    q: "Can the room creator lock or delete the room?",
    a: "Yes. The creator has an owner token that grants lock, suspend, delete, and TTL modification privileges. Locking a room makes it read-only for all other collaborators.",
  },
  {
    id: "limits",
    category: "general",
    q: "What are the rate limits and concurrency caps?",
    a: "Each IP is rate-limited: 300 requests/min default, 20 room creations/min, and 8 password attempts/min (to prevent brute-force attacks). Up to 60 concurrent collaborators can connect to a single room simultaneously.",
  },
  {
    id: "admin",
    category: "security",
    q: "Can server administrators decrypt or read room contents?",
    a: "No. Server administrators can only see encrypted ciphertext blobs and can moderate (suspend or delete) abusive rooms, but cannot read any code, text, or files because the AES decryption key is never transmitted to any server.",
  },
  {
    id: "p2p",
    category: "general",
    q: "How does real-time sync work?",
    a: "Collaborative edits sync in real-time over WebSockets with Conflict-free Replicated Data Types (CRDTs). Live typing indicators, presence, cursors and chat all ride the same encrypted channel — the relay only ever relays ciphertext.",
  },
];

const CATEGORIES = [
  { id: "all", label: "All Questions" },
  { id: "security", label: "Security & Encryption" },
  { id: "rooms", label: "Rooms & TTL" },
  { id: "runner", label: "Code Runner" },
  { id: "account", label: "No-Account Flow" },
  { id: "general", label: "General & Limits" },
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
        className="w-full max-w-2xl max-h-[85vh] flex flex-col hairline anon-raise bg-[#080808] text-[#e7e7e7] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 hairline-b bg-[#0b0b0b]">
          <div className="flex items-center gap-2.5">
            <HelpCircle className="h-5 w-5 anon-accent" />
            <div>
              <h2 className="anon-sans text-base font-semibold">
                Frequently Asked Questions
              </h2>
              <p className="anon-mono text-[11px] anon-mut">
                Honest answers about encryption, privacy, TTL, and code execution.
              </p>
            </div>
          </div>
          <button
            onClick={() => toggleFaq()}
            className="p-1.5 hairline hover:bg-[#1c1c1c] text-[#6d6d6d] hover:text-[#e7e7e7] transition-colors"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="p-4 hairline-b bg-[#080808] space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 anon-dim" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions (e.g., encryption, password, timeout, admin)..."
              className="w-full pl-9 pr-4 py-2 text-xs anon-mono bg-[#0b0b0b] hairline text-[#e7e7e7] focus:outline-none focus:border-[var(--anon-accent)]"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs anon-dim hover:anon-fg"
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
                className={`px-2.5 py-1 text-[11px] anon-mono transition-colors hairline ${
                  selectedCat === cat.id
                    ? "bg-[var(--anon-accent)] text-white border-[var(--anon-accent)]"
                    : "bg-[#0b0b0b] text-[#6d6d6d] hover:text-[#e7e7e7] hover:border-[#3d3d3d]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Questions Accordion List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="anon-mono text-xs anon-dim">No matching questions found.</p>
              <button
                onClick={() => { setQuery(""); setSelectedCat("all"); }}
                className="mt-2 anon-mono text-xs anon-accent hover:underline"
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
                  className="hairline bg-[#0b0b0b] transition-colors hover:border-[#2a2a2a]"
                >
                  <button
                    onClick={() => setExpandedId(isOpen ? null : item.id)}
                    className="flex w-full items-center justify-between p-3.5 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="anon-sans text-xs sm:text-sm font-medium pr-3 text-[#e7e7e7]">
                      {item.q}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 flex-none text-[#6d6d6d] transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-[var(--anon-accent)]" : ""
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
                        <p className="anon-sans text-xs leading-relaxed text-[#a0a0a0] max-w-xl">
                          {item.a}
                        </p>
                        <div className="mt-3 flex items-center justify-between pt-2.5 hairline-t">
                          <span className="anon-mono text-[10px] uppercase tracking-wider text-[#4c8dff]">
                            {item.category}
                          </span>
                          <button
                            onClick={() => copyAnswer(item.id, `${item.q}\n\n${item.a}`)}
                            className="anon-mono inline-flex items-center gap-1 text-[10px] text-[#6d6d6d] hover:text-[#e7e7e7] transition-colors"
                            title="Copy question and answer"
                          >
                            {isCopied ? (
                              <>
                                <Check className="h-3 w-3 text-[var(--anon-ok)]" /> Copied
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
        <div className="flex items-center justify-between px-5 py-3 hairline-t bg-[#0b0b0b]">
          <div className="flex items-center gap-1.5 text-xs text-[#6d6d6d]">
            <Shield className="h-3.5 w-3.5 text-[var(--anon-ok)]" />
            <span className="anon-mono text-[11px]">Zero tracking · AES-GCM-256</span>
          </div>
          <button
            onClick={() => {
              toggleFaq();
              setTimeout(() => toggleSecurity(), 150);
            }}
            className="anon-mono inline-flex items-center gap-1 text-[11px] text-[var(--anon-accent)] hover:underline"
          >
            Threat Model Write-up <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
