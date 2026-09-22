"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Globe, ExternalLink, ArrowRight } from "lucide-react";
import { useAnon } from "@/lib/store";
import { toast } from "sonner";

const CHIP_SITES = [
  { label: "DevDocs", url: "https://devdocs.io/", color: "var(--anon-accent)" },
  { label: "MDN", url: "https://developer.mozilla.org/en-US/search?q=", color: "var(--anon-ok)" },
  { label: "Python", url: "https://docs.python.org/3/search.html?q=", color: "var(--anon-warn)" },
  { label: "C++", url: "https://en.cppreference.com/mwiki/index.php?search=", color: "var(--anon-danger)" },
  { label: "W3Schools", url: "https://www.w3schools.com/", color: "#c792ea" },
  { label: "StackOverflow", url: "https://stackoverflow.com/search?q=", color: "#f472b6" },
];

export function BrowserDrawer() {
  const s = useAnon();
  if (!s.browserOpen) return null;

  function go(url: string) {
    s.setBrowserUrl(url);
    toast.success("Loading", { description: url.slice(0, 60) });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
        onClick={() => s.toggleBrowser()}
      >
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-full w-full max-w-2xl flex-col bg-[var(--anon-panel)] hairline-l shadow-2xl shadow-black/50"
        >
          {/* header */}
          <div className="flex h-11 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              <Globe className="h-4 w-4 anon-accent" /> Browser
            </h2>
            <button onClick={() => s.toggleBrowser()} className="anon-mut hover:anon-fg">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* URL bar */}
          <div className="hairline-b p-3 space-y-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const input = (e.currentTarget.elements.namedItem("url") as HTMLInputElement).value.trim();
                if (input) go(input.startsWith("http") ? input : `https://${input}`);
              }}
              className="flex items-center gap-2"
            >
              <input
                name="url"
                defaultValue={s.browserUrl}
                placeholder="https://…"
                className="anon-mono flex-1 bg-[var(--anon-bg)] hairline px-3 py-2 text-xs outline-none focus:border-[var(--anon-accent)]"
              />
              <button
                type="submit"
                className="anon-mono inline-flex h-9 items-center gap-1 bg-[var(--anon-accent)] px-3 text-xs text-[var(--anon-accent-fg)]"
              >
                go <ArrowRight className="h-3 w-3" />
              </button>
              <a
                href={s.browserUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => toast.success("Opened in new tab")}
                className="anon-mono inline-flex h-9 w-9 items-center justify-center hairline anon-mut hover:bg-[var(--anon-raise)] hover:anon-fg"
                title="Open in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </form>
            {/* chips */}
            <div className="flex flex-wrap gap-1.5">
              {CHIP_SITES.map((c) => (
                <button
                  key={c.label}
                  onClick={() => go(c.url)}
                  className="anon-mono hairline px-2 py-1 text-[10px] anon-mut hover:bg-[var(--anon-raise)] hover:anon-fg"
                  style={{ borderColor: "var(--anon-line)" }}
                >
                  <span style={{ color: c.color }}>●</span> {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* iframe (sandboxed — opaque origin: scripts/forms run, but the
              frame can never reach our origin's storage or DOM) */}
          <div className="flex-1 bg-[var(--anon-bg)]">
            {s.browserUrl ? (
              <iframe
                src={s.browserUrl}
                title="anonshare-browser"
                className="h-full w-full"
                sandbox="allow-scripts allow-forms allow-popups"
                referrerPolicy="no-referrer"
                onLoad={() => {}}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 anon-mut">
                <Globe className="h-8 w-8 anon-dim" />
                <p className="anon-mono text-xs">enter a URL or pick a doc site above</p>
                <p className="anon-mono text-[10px] anon-dim text-center max-w-sm">
                  note: some sites (Google, MDN) send X-Frame-Options headers that prevent embedding — click the open-in-new-tab icon instead.
                </p>
              </div>
            )}
          </div>

          <div className="hairline-t px-3 py-1.5 anon-mono text-[10px] anon-dim flex items-center justify-between">
            <span>sandboxed iframe · no-referrer</span>
            <span className="truncate max-w-[200px]">{s.browserUrl}</span>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
