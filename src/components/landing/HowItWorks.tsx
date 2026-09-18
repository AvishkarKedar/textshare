"use client";

const STEPS = [
  {
    n: "01",
    title: "Open a room",
    body: "Click Create. A 6-character code is generated. Nothing about you is stored — not your email, not your IP beyond a 60-second rate-limit window.",
  },
  {
    n: "02",
    title: "Share the code",
    body: "Send the code (or a view-only link, or a QR for mobile). They type it in. Their browser derives the same AES-GCM key from the code — relay never sees it.",
  },
  {
    n: "03",
    title: "Write together. Erase on the way out.",
    body: "Cursors, chat, files, voice — all sync in real time. When the last person leaves, the room self-destructs after the TTL you chose (10 min / 1 h / 24 h).",
  },
];

export function HowItWorks() {
  return (
    <section className="hairline-t">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-10">
          <div className="anon-mono mb-2 text-xs uppercase tracking-wider anon-dim">
            how it works
          </div>
          <h2 className="anon-sans text-2xl font-semibold tracking-tight sm:text-3xl">
            Three steps. No account. No trace.
          </h2>
        </div>
        <ol className="grid grid-cols-1 gap-px bg-[var(--anon-line)] sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="anon-raise p-6">
              <div className="anon-mono mb-3 text-xs anon-accent">{s.n}</div>
              <h3 className="anon-sans mb-2 text-base font-medium">{s.title}</h3>
              <p className="anon-sans text-sm leading-relaxed anon-mut">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
