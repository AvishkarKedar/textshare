"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useAnon } from "@/lib/store";
import { toast } from "sonner";

const FAQS = [
  {
    q: "Is it really end-to-end encrypted?",
    a: "Yes. The 6-character code (plus optional password) is run through PBKDF2-SHA256 at 600,000 rounds with two different salts — one derives your AES-GCM 256 key (never leaves the browser), the other derives an auth token (the relay only stores SHA-256 of it). The relay forwards opaque ciphertext; it cannot read your code or chat.",
  },
  {
    q: "What happens when everyone leaves?",
    a: "The room's Durable Object tracks the last active timestamp. Once no one is connected for 10 minutes, 1 hour, or 24 hours (whichever TTL the owner chose), the entire room — code, chat, files, history — is erased from storage. There is no recovery.",
  },
  {
    q: "Do I need an account?",
    a: "Never. No email, no password, no cookies beyond a single owner token in localStorage that grants you lock / suspend / delete rights for that room only. Clear your browser storage and the token is gone — the room keeps living until its TTL expires.",
  },
  {
    q: "Is the code-runner sandboxed?",
    a: "On the operator's hosted relay, code runs inside a Bubblewrap-sealed Linux namespace with no network, 256 MB RAM cap, and tmpfs only. If you self-host the open-source Worker, the runner falls back to the public emkc.org Piston API — be aware of that before pasting secrets.",
  },
  {
    q: "Can the owner lock or delete the room?",
    a: "Yes. The owner has a 256-bit token (kept client-side) that grants lock / suspend / delete / change-TTL rights. Locking makes the room read-only for everyone. There's no recovery if you lose the owner token, but the TTL still applies.",
  },
  {
    q: "What about rate limits and abuse?",
    a: "Each IP is throttled by a per-scope Limiter Durable Object: 300 requests/min default, 20 creates/min, 8 auth attempts/min (to slow password guessing). Admins can override these at runtime via the admin dashboard.",
  },
  {
    q: "How many people can be in a room?",
    a: "Up to 60 concurrent connections per room. Beyond that, new joins get a 429. WebRTC peer-to-peer mesh accelerates sync between active editors so the relay only carries signaling.",
  },
  {
    q: "Is there an admin who can read my room?",
    a: "No. Admins can suspend, lock, or delete rooms (moderation only) but cannot decrypt contents — they don't have the AES key. The auth token they could see is only a SHA-256 hash. Admin login itself is rate-limited and fail-closed if the secret is unset.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const toggleSecurity = useAnon((s) => s.toggleSecurity);
  const setView = useAnon((s) => s.setView);
  return (
    <section className="hairline-t">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <div className="anon-mono mb-2 text-xs uppercase tracking-wider anon-dim">
              faq
            </div>
            <h2 className="anon-sans text-2xl font-semibold tracking-tight sm:text-3xl">
              Questions,
              <br />
              honestly answered.
            </h2>
            <p className="anon-sans mt-4 text-sm leading-relaxed anon-mut">
              Including the ones most products dodge. See the full threat model
              in our security write-up.
            </p>
            <button
              onClick={() => {
                setView("editor");
                setTimeout(() => toggleSecurity(), 200);
                toast("Opening threat model", { description: "Full security write-up with honest limits." });
              }}
              className="anon-mono mt-4 inline-flex items-center gap-1 text-xs anon-accent hover:underline"
            >
              Read security.html →
            </button>
          </div>
          <div className="hairline">
            {FAQS.map((f, i) => {
              const isOpen = open === i;
              return (
                <div key={i} className="hairline-b last:border-b-0">
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-[var(--anon-raise)]"
                    aria-expanded={isOpen}
                  >
                    <span className="anon-sans text-sm font-medium">{f.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 flex-none transition-transform ${isOpen ? "rotate-180" : ""}`}
                      style={{ color: "var(--anon-mut)" }}
                    />
                  </button>
                  {isOpen && (
                    <div className="anim-rise px-4 pb-4">
                      <p className="anon-sans max-w-2xl text-sm leading-relaxed anon-mut">
                        {f.a}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
