"use client";

import { Github, Shield, FileText } from "lucide-react";
import { useAnon } from "@/lib/store";
import { toast } from "sonner";

export function LandingFooter() {
  const toggleSecurity = useAnon((s) => s.toggleSecurity);
  const togglePrivacy = useAnon((s) => s.togglePrivacy);
  const toggleTerms = useAnon((s) => s.toggleTerms);
  const toggleStatus = useAnon((s) => s.toggleStatus);
  const toggleShortcuts = useAnon((s) => s.toggleShortcuts);
  const toggleFaq = useAnon((s) => s.toggleFaq);

  const scrollToFaq = () => {
    const el = document.getElementById("faq");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    } else {
      toggleFaq();
    }
  };

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
              <li><button onClick={() => toggleFaq()} className="hover:anon-fg text-left cursor-pointer">Frequently Asked Questions (FAQ)</button></li>
              <li><button onClick={() => toggleShortcuts()} className="hover:anon-fg text-left cursor-pointer">Keyboard shortcuts</button></li>
              <li><button onClick={() => toast("Slash commands in editor", { description: "Type / in any line: /run /clear /history /crypto /faq /export …" })} className="hover:anon-fg text-left cursor-pointer">Slash commands</button></li>
              <li><button onClick={() => toggleStatus()} className="hover:anon-fg text-left cursor-pointer">System status</button></li>
            </ul>
          </div>

          <div>
            <div className="anon-mono mb-3 text-xs uppercase tracking-wider anon-dim">
              legal
            </div>
            <ul className="space-y-2 anon-sans text-sm anon-mut">
              <li><button onClick={() => toggleSecurity()} className="hover:anon-fg inline-flex items-center gap-1 cursor-pointer"><Shield className="h-3 w-3" /> Security & Threat Model</button></li>
              <li><button onClick={() => togglePrivacy()} className="hover:anon-fg inline-flex items-center gap-1 cursor-pointer"><FileText className="h-3 w-3" /> Privacy Policy</button></li>
              <li><button onClick={() => toggleTerms()} className="hover:anon-fg inline-flex items-center gap-1 cursor-pointer"><FileText className="h-3 w-3" /> Terms of Service</button></li>
            </ul>
          </div>

          <div>
            <div className="anon-mono mb-3 text-xs uppercase tracking-wider anon-dim">
              build
            </div>
            <ul className="space-y-2 anon-mono text-xs anon-mut">
              <li>v5.4.0</li>
              <li>relay: relay.avishkark.in</li>
              <li>sw: anonshare-v22</li>
              <li>region: auto</li>
            </ul>
          </div>
        </div>

        <div className="hairline-t mt-8 flex flex-col items-start justify-between gap-2 pt-6 sm:flex-row sm:items-center">
          <p className="anon-mono text-[11px] anon-dim">
            © {new Date().getFullYear()} anonshare · MIT · built by <a href="https://avishkark.in" target="_blank" rel="noopener" className="anon-accent hover:underline">Avishkar Kedar</a>
          </p>
          <p className="anon-mono text-[11px] anon-dim">
            <a href="mailto:avishkarkedar+text@gmail.com" className="hover:anon-fg">avishkarkedar+text@gmail.com</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
