"use client";

import { useState } from "react";
import { ArrowRight, Shield, Timer, UserX, Loader2, Bookmark } from "lucide-react";
import { useAnon } from "@/lib/store";
import { motion } from "framer-motion";
import { DemoCard } from "./DemoCard";

const AL = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function randomCode() {
  let s = "";
  for (let i = 0; i < 6; i++) s += AL[Math.floor(Math.random() * AL.length)];
  return s;
}

export function Hero() {
  const enterRoom = useAnon((s) => s.enterRoom);
  const recentRooms = useAnon((s) => s.recentRooms);
  const toggleBookmarks = useAnon((s) => s.toggleBookmarks);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [booting, setBooting] = useState(false);

  function handleCreate() {
    setErr("");
    setBooting(true);
    setTimeout(() => {
      enterRoom({ isOwner: true, ttl: "24h" });
      setBooting(false);
    }, 700);
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) {
      setErr("Enter a 6-character room code.");
      return;
    }
    if (c.length !== 6 || ![...c].every((ch) => AL.includes(ch))) {
      setErr("Codes are 6 characters: 2–9 and A–Z (no 0/O/1/I).");
      return;
    }
    setErr("");
    setBooting(true);
    setTimeout(() => {
      enterRoom({ code: c, isOwner: false });
      setBooting(false);
    }, 700);
  }

  return (
    <section className="relative w-full overflow-hidden">
      {/* hero glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/4 h-96 w-96 rounded-full opacity-20 blur-3xl anim-glow"
        style={{ background: "radial-gradient(circle, var(--anon-accent) 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-20 right-1/4 h-72 w-72 rounded-full opacity-10 blur-3xl anim-glow"
        style={{ background: "radial-gradient(circle, var(--anon-ok) 0%, transparent 70%)", animationDelay: "2s" }}
      />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 pt-16 pb-12 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pt-24">
        {/* left: copy + actions */}
        <div className="relative flex flex-col gap-6">
          {/* what's new pill */}
          <button
            onClick={() => {
              import("sonner").then(({ toast }) => {
                toast("What's new in v5.1", {
                  description: "Whiteboard · slash commands · smart notifications · voice mesh · crypto explainer · generative UI · find-and-replace · recent rooms · goal banner · markdown preview · syntax highlighting · 5 themes · 24 keyboard shortcuts.",
                  duration: 8000,
                });
              });
            }}
            className="anon-mono group inline-flex w-fit items-center gap-2 hairline anon-raise px-2.5 py-1 text-[10px] anon-mut transition-colors hover:bg-[var(--anon-panel)]"
          >
            <span className="inline-flex h-1.5 w-1.5 rounded-full anim-beat" style={{ background: "var(--anon-ok)" }} />
            <span className="anon-fg">v5.1</span> · whiteboard, slash commands, smart notifications
            <span className="anon-accent transition-transform group-hover:translate-x-0.5">→</span>
          </button>

          <div className="flex items-center gap-3">
            <span className="anon-mono text-sm anon-accent hero-caret">{'>'}</span>
            <span className="anon-mono text-sm anon-fg">anonshare</span>
          </div>

          <h1 className="anon-sans text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Live coding with anyone,
            <br />
            <span className="gradient-text">in six characters.</span>
          </h1>

          <p className="max-w-xl anon-sans text-base leading-relaxed anon-mut sm:text-lg">
            Encrypted in your browser. Erased when you leave. No account, ever.
            Your room is six characters — share the code, write together in real
            time, and the relay never sees plaintext.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              onClick={handleCreate}
              disabled={booting}
              className="anon-mono inline-flex h-11 items-center justify-center gap-2 bg-[var(--anon-accent)] px-5 text-sm font-medium text-[var(--anon-accent-fg)] transition-transform hover:brightness-110 active:translate-y-px disabled:opacity-60"
            >
              {booting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Deriving your key…
                </>
              ) : (
                <>
                  Create a room <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
            <div className="anon-mono text-xs anon-mut">or press ⌘K any time</div>
          </div>

          <div className="hairline-t pt-5">
            <div className="anon-mono mb-3 text-xs uppercase tracking-wider anon-dim">
              or join with a code
            </div>
            <form onSubmit={handleJoin} className="flex items-stretch gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                spellCheck={false}
                autoCapitalize="characters"
                autoComplete="off"
                aria-label="Room code"
                className="anon-mono h-12 w-44 flex-none bg-[var(--anon-panel)] px-3 text-center text-lg tracking-[0.3em] uppercase hairline outline-none focus:border-[var(--anon-accent)]"
              />
              <button
                type="submit"
                aria-label="Join room"
                className="anon-mono inline-flex h-12 w-12 items-center justify-center bg-[var(--anon-raise)] hairline transition-colors hover:border-[var(--anon-mut)] hover:bg-[var(--anon-panel)]"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
            </form>
            {err && (
              <p role="alert" className="anon-mono mt-2 anim-shake text-xs" style={{ color: "var(--anon-danger)" }}>
                {err}
              </p>
            )}
            {/* recent rooms quick-rejoin */}
            {recentRooms.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => toggleBookmarks()}
                  className="anon-mono inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider anon-dim hover:anon-accent"
                >
                  <Bookmark className="h-3 w-3" /> recent rooms
                </button>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {recentRooms.slice(0, 4).map((r) => (
                    <button
                      key={r.code}
                      onClick={() => enterRoom({ code: r.code, title: r.title, emoji: r.emoji, isOwner: r.isOwner, hasPassword: r.hasPassword })}
                      className="anon-mono hairline anon-raise px-2 py-1 text-[10px] anon-mut hover:bg-[var(--anon-panel)] hover:anon-fg transition-colors"
                      title={`${r.title} · rejoin ${r.code}`}
                    >
                      <span>{r.emoji}</span>{" "}
                      <span className="anon-accent">{r.code}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 anon-mono text-xs anon-mut">
            <span className="inline-flex items-center gap-2">
              <Shield className="h-3.5 w-3.5" style={{ color: "var(--anon-ok)" }} /> E2E encrypted
            </span>
            <span className="inline-flex items-center gap-2">
              <Timer className="h-3.5 w-3.5" style={{ color: "var(--anon-warn)" }} /> Erased on the way out
            </span>
            <span className="inline-flex items-center gap-2">
              <UserX className="h-3.5 w-3.5" style={{ color: "var(--anon-accent)" }} /> No account ever
            </span>
          </div>
        </div>

        {/* right: animated demo card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
          className="relative anim-float"
          style={{ animationDuration: "6s" }}
        >
          <DemoCard />
        </motion.div>
      </div>
    </section>
  );
}
