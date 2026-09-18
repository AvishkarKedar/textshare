"use client";

import { Code2, Users, FileCode2 } from "lucide-react";
import { motion } from "framer-motion";

const USE_CASES = [
  {
    icon: Users,
    title: "Pair programming",
    body: "Spin up a room, drop the code in a chat, watch your partner's cursor move line by line. No repo, no setup, no friction.",
    accent: "var(--anon-accent)",
  },
  {
    icon: Code2,
    title: "Interview practice",
    body: "Share a 6-character code over the call. Run Python, JS, C++, Rust — fifteen languages, in-browser, no install.",
    accent: "var(--anon-ok)",
  },
  {
    icon: FileCode2,
    title: "Sharing a quick snippet",
    body: "Faster than a gist, more private than a paste. Set a 10-minute TTL, paste, share, and the room is gone when you close the tab.",
    accent: "var(--anon-warn)",
  },
];

export function UseCases() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <div className="anon-mono mb-2 text-xs uppercase tracking-wider anon-dim">
            what people use it for
          </div>
          <h2 className="anon-sans text-2xl font-semibold tracking-tight sm:text-3xl">
            Three rooms, three reasons.
          </h2>
        </div>
        <div className="anon-mono hidden text-xs anon-mut sm:block">/use-cases</div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {USE_CASES.map((u, i) => {
          const Icon = u.icon;
          return (
            <motion.div
              key={u.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.08 }}
              className="group relative hairline anon-panel p-6 transition-all hover:bg-[var(--anon-raise)] hover:border-[var(--anon-line2)]"
            >
              <div
                className="mb-4 inline-flex h-10 w-10 items-center justify-center hairline transition-transform group-hover:scale-110"
                style={{ color: u.accent, borderColor: u.accent + "40" }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="anon-sans mb-2 text-lg font-medium">{u.title}</h3>
              <p className="anon-sans text-sm leading-relaxed anon-mut">{u.body}</p>
              <div
                className="absolute inset-x-0 bottom-0 h-px opacity-0 transition-opacity group-hover:opacity-100"
                style={{ background: u.accent }}
              />
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
