"use client";

import { ArrowRight } from "lucide-react";
import { useAnon } from "@/lib/store";

export function CtaBanner() {
  const enterRoom = useAnon((s) => s.enterRoom);
  return (
    <section className="hairline-t">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="relative overflow-hidden hairline anon-panel p-8 sm:p-12">
          {/* glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-20 blur-3xl"
            style={{ background: "radial-gradient(circle, var(--anon-accent) 0%, transparent 70%)" }}
          />
          <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="anon-sans text-2xl font-semibold tracking-tight sm:text-3xl">
                Open a room. It disappears in an hour.
              </h2>
              <p className="anon-sans mt-2 max-w-xl text-sm anon-mut">
                No account. No email. No trace. Six characters between you and a
                live, encrypted session with anyone on the internet.
              </p>
            </div>
            <button
              onClick={() => enterRoom({ isOwner: true, ttl: "1h" })}
              className="anon-mono inline-flex h-11 flex-none items-center justify-center gap-2 bg-[var(--anon-accent)] px-5 text-sm font-medium text-[var(--anon-accent-fg)] transition-transform hover:brightness-110 active:translate-y-px"
            >
              Create a room <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
