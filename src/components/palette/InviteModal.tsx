"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { X, Copy, Check, Eye, Pencil, QrCode, Link2, Shield } from "lucide-react";
import { useAnon } from "@/lib/store";
import { toast } from "sonner";

export function InviteModal() {
  const s = useAnon();
  const [role, setRole] = useState<"edit" | "view">("edit");
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  if (!s.inviteOpen) return null;

  const baseUrl = typeof window !== "undefined" ? `${window.location.origin}/` : "https://code.avishkark.in/";
  const link = `${baseUrl}?join=${s.roomCode}${role === "view" ? "&p=1" : ""}`;

  function copy(kind: "link" | "code", value: string) {
    navigator.clipboard?.writeText(value);
    setCopied(kind);
    toast.success(kind === "link" ? "Link copied" : "Code copied", {
      description: kind === "link" ? "Share it anywhere — view-only stays read-only." : value,
    });
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
        onClick={() => s.toggleInvite()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md hairline anon-panel shadow-2xl shadow-black/50"
        >
          {/* header */}
          <div className="flex h-11 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              <Link2 className="h-4 w-4 anon-accent" /> Invite to room
            </h2>
            <button onClick={() => s.toggleInvite()} className="anon-mut hover:anon-fg">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* room code block */}
            <div>
              <div className="anon-mono mb-1.5 text-[10px] uppercase tracking-wider anon-dim">
                room code
              </div>
              <div className="flex items-center gap-2">
                <div className="anon-mono flex-1 bg-[var(--anon-bg)] hairline px-3 py-2.5 text-center text-2xl tracking-[0.4em] font-semibold anon-fg">
                  {s.roomCode || "ABC123"}
                </div>
                <button
                  onClick={() => copy("code", s.roomCode)}
                  className="inline-flex h-11 w-11 items-center justify-center hairline anon-raise hover:bg-[var(--anon-panel)]"
                  aria-label="Copy code"
                >
                  {copied === "code" ? <Check className="h-4 w-4" style={{ color: "var(--anon-ok)" }} /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* role toggle */}
            <div>
              <div className="anon-mono mb-1.5 text-[10px] uppercase tracking-wider anon-dim">
                link permission
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setRole("edit")}
                  className={`flex flex-col items-start gap-1 p-3 text-left hairline transition-colors ${
                    role === "edit" ? "bg-[var(--anon-raise)] border-[var(--anon-accent)]" : "hover:bg-[var(--anon-raise)]"
                  }`}
                >
                  <span className="anon-mono inline-flex items-center gap-1 text-xs anon-fg">
                    <Pencil className="h-3 w-3 anon-accent" /> Edit
                  </span>
                  <span className="anon-mono text-[10px] anon-mut">collaborator can write</span>
                </button>
                <button
                  onClick={() => setRole("view")}
                  className={`flex flex-col items-start gap-1 p-3 text-left hairline transition-colors ${
                    role === "view" ? "bg-[var(--anon-raise)] border-[var(--anon-accent)]" : "hover:bg-[var(--anon-raise)]"
                  }`}
                >
                  <span className="anon-mono inline-flex items-center gap-1 text-xs anon-fg">
                    <Eye className="h-3 w-3" style={{ color: "var(--anon-warn)" }} /> View-only
                  </span>
                  <span className="anon-mono text-[10px] anon-mut">read-only spectator</span>
                </button>
              </div>
            </div>

            {/* share link */}
            <div>
              <div className="anon-mono mb-1.5 text-[10px] uppercase tracking-wider anon-dim">
                share link
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={link}
                  className="anon-mono flex-1 bg-[var(--anon-bg)] hairline px-3 py-2.5 text-xs anon-fg outline-none"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  onClick={() => copy("link", link)}
                  className="inline-flex h-11 items-center gap-1.5 px-3 bg-[var(--anon-accent)] text-[var(--anon-accent-fg)] anon-mono text-xs hover:brightness-110"
                >
                  {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied === "link" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* QR */}
            <div className="flex items-center gap-4 hairline bg-[var(--anon-bg)] p-4">
              <div className="anon-mono bg-white p-2">
                <QRCodeSVG value={link} size={104} level="M" />
              </div>
              <div className="flex-1">
                <div className="anon-mono mb-1 inline-flex items-center gap-1.5 text-xs anon-fg">
                  <QrCode className="h-3.5 w-3.5 anon-accent" /> Continue on mobile
                </div>
                <p className="anon-mono text-[10px] leading-relaxed anon-mut">
                  Scan with a phone camera to join instantly. Same room, same
                  identity — sync across devices.
                </p>
                <div className="anon-mono mt-2 inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--anon-ok)" }}>
                  <Shield className="h-2.5 w-2.5" /> e2e · {s.ttl} ttl
                </div>
              </div>
            </div>
          </div>

          <div className="hairline-t flex items-center justify-between px-4 py-2 anon-mono text-[10px] anon-dim">
            <span>relay: relay.avishkark.in</span>
            <button onClick={() => s.toggleInvite()} className="anon-mut hover:anon-fg">done</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
