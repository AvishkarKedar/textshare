"use client";

import { Github, Shield, FileText, Heart } from "lucide-react";
import { useAnon } from "@/lib/store";
import { toast } from "sonner";

export function LandingFooter() {
  const toggleSecurity = useAnon((s) => s.toggleSecurity);
  const togglePrivacy = useAnon((s) => s.togglePrivacy);
  const toggleTerms = useAnon((s) => s.toggleTerms);
  const toggleStatus = useAnon((s) => s.toggleStatus);
  const toggleShortcuts = useAnon((s) => s.toggleShortcuts);
  const setView = useAnon((s) => s.setView);
  return (
    <footer className="mt-auto hairline-t anon-raise">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="anon-mono mb-3 text-sm anon-fg">
              <span className="anon-accent">{'>'}</span> anonshare
            </div>
            <p className="anon-sans text-xs leading-relaxed anon-mut">
              A live, end-to-end-encrypted collaborative scratchpad. MIT
              licensed.
            </p>
            <a
              href="https://github.com/AvishkarKedar/textshare"
              target="_blank"
              rel="noopener noreferrer"
              className="anon-mono mt-3 inline-flex items-center gap-1 text-xs anon-mut hover:anon-accent"
            >
              <Github className="h-3.5 w-3.5" /> github
            </a>
          </div>

          <div>
            <div className="anon-mono mb-3 text-xs uppercase tracking-wider anon-dim">
              help
            </div>
            <ul className="space-y-2 anon-sans text-sm anon-mut">
              <li><button onClick={() => { setView("editor"); setTimeout(() => toggleShortcuts(), 200); }} className="hover:anon-fg">Keyboard shortcuts</button></li>
              <li><button onClick={() => { setView("editor"); setTimeout(() => toast("Type / in the editor", { description: "Slash commands: /run /test /clear /whiteboard /crypto /export …" }), 200); }} className="hover:anon-fg">Slash commands</button></li>
              <li><button onClick={() => { setView("editor"); setTimeout(() => toggleStatus(), 200); }} className="hover:anon-fg">Status</button></li>
            </ul>
          </div>

          <div>
            <div className="anon-mono mb-3 text-xs uppercase tracking-wider anon-dim">
              legal
            </div>
            <ul className="space-y-2 anon-sans text-sm anon-mut">
              <li><button onClick={() => { setView("editor"); setTimeout(() => toggleSecurity(), 200); }} className="hover:anon-fg inline-flex items-center gap-1"><Shield className="h-3 w-3" /> Security</button></li>
              <li><button onClick={() => { setView("editor"); setTimeout(() => togglePrivacy(), 200); }} className="hover:anon-fg inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Privacy</button></li>
              <li><button onClick={() => { setView("editor"); setTimeout(() => toggleTerms(), 200); }} className="hover:anon-fg inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Terms</button></li>
            </ul>
          </div>

          <div>
            <div className="anon-mono mb-3 text-xs uppercase tracking-wider anon-dim">
              build
            </div>
            <ul className="space-y-2 anon-mono text-xs anon-mut">
              <li>v5.1.0</li>
              <li>relay: relay.avishkark.in</li>
              <li>sw: anonshare-v22</li>
              <li>region: auto</li>
            </ul>
          </div>
        </div>

        <div className="hairline-t mt-8 flex flex-col items-start justify-between gap-2 pt-6 sm:flex-row sm:items-center">
          <p className="anon-mono text-[11px] anon-dim">
            © {new Date().getFullYear()} anonshare. Sharp corners everywhere. The only round thing is a person.
          </p>
          <p className="anon-mono text-[11px] anon-dim inline-flex items-center gap-1">
            made with <Heart className="h-3 w-3" style={{ color: "var(--anon-danger)" }} /> in pune
          </p>
        </div>
      </div>
    </footer>
  );
}
