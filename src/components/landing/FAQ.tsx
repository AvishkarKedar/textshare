"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useAnon } from "@/lib/store";
import { toast } from "sonner";
import { FAQ_DATA } from "@/components/palette/FaqModal";

/** Curated subset shown inline; the full set lives in the searchable modal. */
const INLINE_FAQS = FAQ_DATA.filter((f) =>
  ["e2e", "ttl", "account", "runner", "owner", "limits", "admin", "p2p"].includes(f.id),
);

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const toggleSecurity = useAnon((s) => s.toggleSecurity);
  const toggleFaq = useAnon((s) => s.toggleFaq);
  return (
    <section id="faq" className="hairline-t scroll-mt-12">
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
              Including the ones most products dodge. Every answer below is the
              same one you&apos;ll get from the code — no marketing layer. See
              all {FAQ_DATA.length} questions with search and category filters
              in the interactive modal, or the full security write-up.
            </p>
            <div className="mt-4 flex flex-col gap-2 items-start">
              <button
                onClick={() => toggleFaq()}
                className="anon-mono inline-flex items-center gap-1.5 text-xs bg-[var(--anon-panel)] hairline px-3 py-1.5 hover:bg-[var(--anon-raise)] hover:text-[var(--anon-fg)] transition-colors cursor-pointer"
              >
                <span>🔍</span> Search all {FAQ_DATA.length} questions (⌘⇧F) →
              </button>
              <button
                onClick={() => {
                  toggleSecurity();
                  toast("Opening threat model", { description: "Full security write-up with honest limits." });
                }}
                className="anon-mono inline-flex items-center gap-1 text-xs anon-accent hover:underline cursor-pointer"
              >
                Read security write-up →
              </button>
            </div>
          </div>
          <div className="hairline">
            {INLINE_FAQS.map((f, i) => {
              const isOpen = open === i;
              return (
                <div key={f.id} className="hairline-b last:border-b-0">
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
