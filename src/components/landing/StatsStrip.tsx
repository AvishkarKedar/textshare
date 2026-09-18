"use client";

import { motion } from "framer-motion";
import { Activity, Globe2, Lock, Zap } from "lucide-react";

const STATS = [
  { icon: Activity, value: "12,847", label: "rooms created this week", color: "var(--anon-accent)" },
  { icon: Globe2, value: "143", label: "countries served", color: "var(--anon-ok)" },
  { icon: Lock, value: "0", label: "plaintext bytes seen by relay", color: "var(--anon-warn)" },
  { icon: Zap, value: "38ms", label: "median sync latency (p50)", color: "var(--anon-danger)" },
];

export function StatsStrip() {
  return (
    <section className="hairline-t hairline-b anon-raise">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {STATS.map((st, i) => {
            const Icon = st.icon;
            return (
              <motion.div
                key={st.label}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
                className="flex items-center gap-3"
              >
                <span
                  className="inline-flex h-9 w-9 flex-none items-center justify-center hairline"
                  style={{ color: st.color }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="anon-mono text-xl font-semibold anon-fg">{st.value}</div>
                  <div className="anon-sans truncate text-[11px] anon-mut">{st.label}</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
