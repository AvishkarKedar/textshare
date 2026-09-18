"use client";

import { Quote } from "lucide-react";

const QUOTES = [
  {
    body: "We use anonshare for every interview round. Candidates love that nothing's stored — we love that setup takes six seconds.",
    name: "Priya Nair",
    role: "Eng Manager, fintech startup",
    color: "#3ddc84",
  },
  {
    body: "Replaced our internal paste tool overnight. The encrypted-by-default model means I can finally stop writing threat-model caveats in Slack.",
    name: "Marcus Lee",
    role: "Staff Security Engineer",
    color: "#4c8dff",
  },
  {
    body: "The time-machine slider alone is worth it. Watching a junior dev rewind their own refactor is the best teaching tool I've found.",
    name: "Ana Costa",
    role: "Tech Lead, dev tools",
    color: "#c792ea",
  },
];

export function Testimonials() {
  return (
    <section className="hairline-t">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-8">
          <div className="anon-mono mb-2 text-xs uppercase tracking-wider anon-dim">
            what people say
          </div>
          <h2 className="anon-sans text-2xl font-semibold tracking-tight sm:text-3xl">
            Trusted by teams who don&apos;t trust easily.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {QUOTES.map((q) => (
            <figure key={q.name} className="relative hairline anon-panel p-6">
              <Quote className="mb-3 h-4 w-4" style={{ color: q.color }} />
              <blockquote className="anon-sans text-sm leading-relaxed anon-fg">
                &ldquo;{q.body}&rdquo;
              </blockquote>
              <figcaption className="mt-4 flex items-center gap-2.5">
                <span
                  className="anon-mono inline-flex h-7 w-7 flex-none items-center justify-center text-[10px] font-semibold text-black"
                  style={{ background: q.color }}
                >
                  {q.name.split(" ").map((p) => p[0]).join("")}
                </span>
                <div>
                  <div className="anon-sans text-xs font-medium anon-fg">{q.name}</div>
                  <div className="anon-mono text-[10px] anon-mut">{q.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
