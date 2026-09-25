"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

/**
 * Scroll-triggered reveal for landing sections — a subtle rise + fade-in
 * micro-animation.
 *
 * SSR/hydration safety: the FIRST render (server + client) always emits the
 * plain children — identical markup on both sides. framer-motion's
 * `useReducedMotion()` returns `null` during SSR but `true`/`false` on the
 * client, so branching on it during render produced mismatched trees and
 * broke hydration for reduced-motion users (dead buttons app-wide). The
 * mounted-gate below guarantees React can always hydrate, and the animation
 * only kicks in after mount. prefers-reduced-motion: no animation, content
 * is simply visible.
 */
export function Reveal({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || reduce) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
