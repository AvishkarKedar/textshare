"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Sparkles, Check } from "lucide-react";
import { useAnon, TOUR_STEPS } from "@/lib/store";
import { toast } from "sonner";

export function OnboardingTour() {
  const s = useAnon();
  if (!s.tourOpen) return null;
  const step = TOUR_STEPS[s.tourStep];
  if (!step) return null;
  const isLast = s.tourStep === TOUR_STEPS.length - 1;
  const isFirst = s.tourStep === 0;

  function doAction() {
    switch (step.action) {
      case "palette":
        s.togglePalette();
        break;
      case "slash":
        toast("Type / in the editor", { description: "A popup will appear with all slash commands." });
        break;
      case "theme":
        s.toggleSettings();
        break;
      case "run":
        toast("Press ⌘↵ in the editor", { description: "Or click the Run button in the toolbar." });
        break;
      case "chat":
        s.toggleChat();
        break;
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 sm:items-center"
        onClick={() => s.dismissTour()}
      >
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg hairline anon-panel shadow-2xl shadow-black/60"
        >
          {/* header with progress */}
          <div className="hairline-b px-5 py-3 flex items-center gap-3">
            <span className="anon-mono inline-flex items-center gap-1.5 text-xs anon-accent">
              <Sparkles className="h-3.5 w-3.5" /> tour
            </span>
            <div className="flex flex-1 items-center gap-1">
              {TOUR_STEPS.map((_, i) => (
                <span
                  key={i}
                  className="h-1 flex-1 transition-colors"
                  style={{
                    background:
                      i < s.tourStep
                        ? "var(--anon-ok)"
                        : i === s.tourStep
                          ? "var(--anon-accent)"
                          : "var(--anon-line2)",
                  }}
                />
              ))}
            </div>
            <span className="anon-mono text-[10px] anon-dim">
              {s.tourStep + 1}/{TOUR_STEPS.length}
            </span>
            <button
              onClick={() => s.dismissTour()}
              className="anon-mut hover:anon-fg ml-2"
              aria-label="Dismiss tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* body */}
          <div className="p-5">
            <h2 className="anon-sans text-lg font-semibold tracking-tight anon-fg">
              {step.title}
            </h2>
            <p className="anon-sans mt-2 text-sm leading-relaxed anon-mut">
              {step.body}
            </p>
            {step.kbd && (
              <div className="mt-4 inline-flex items-center gap-2 hairline bg-[var(--anon-bg)] px-3 py-1.5">
                <kbd className="anon-mono text-sm anon-fg">{step.kbd}</kbd>
                <span className="anon-mono text-[10px] anon-dim">try it</span>
              </div>
            )}
          </div>

          {/* actions */}
          <div className="hairline-t px-5 py-3 flex items-center gap-2">
            {!isFirst ? (
              <button
                onClick={() => s.prevTourStep()}
                className="anon-mono inline-flex items-center gap-1 hairline px-3 py-1.5 text-xs anon-mut hover:bg-[var(--anon-raise)] hover:anon-fg"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> back
              </button>
            ) : (
              <span />
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => s.dismissTour()}
                className="anon-mono px-3 py-1.5 text-xs anon-mut hover:anon-fg"
              >
                skip
              </button>
              {step.action && (
                <button
                  onClick={doAction}
                  className="anon-mono inline-flex items-center gap-1 hairline px-3 py-1.5 text-xs anon-fg hover:bg-[var(--anon-raise)]"
                >
                  try it
                </button>
              )}
              {isLast ? (
                <button
                  onClick={() => {
                    s.dismissTour();
                    toast.success("Tour complete", { description: "Press ? any time to see all shortcuts." });
                  }}
                  className="anon-mono inline-flex items-center gap-1 bg-[var(--anon-ok)] px-4 py-1.5 text-xs text-black hover:brightness-110"
                >
                  <Check className="h-3.5 w-3.5" /> done
                </button>
              ) : (
                <button
                  onClick={() => s.nextTourStep()}
                  className="anon-mono inline-flex items-center gap-1 bg-[var(--anon-accent)] px-4 py-1.5 text-xs text-[var(--anon-accent-fg)] hover:brightness-110"
                >
                  next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
