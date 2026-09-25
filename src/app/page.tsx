"use client";

import { useEffect } from "react";
import { useAnon } from "@/lib/store";
import { useSync } from "@/lib/use-sync";
import { Landing } from "@/components/landing/Landing";
import { AppShell } from "@/components/editor/AppShell";
import { CommandPalette } from "@/components/palette/CommandPalette";
import { ShortcutsOverlay } from "@/components/palette/ShortcutsOverlay";
import { InviteModal } from "@/components/palette/InviteModal";
import { SettingsPanel } from "@/components/palette/SettingsPanel";
import { HistoryDrawer } from "@/components/palette/HistoryDrawer";
import { NotificationsPanel } from "@/components/palette/NotificationsPanel";
import { GenerativeModal } from "@/components/palette/GenerativeModal";
import { BrowserDrawer } from "@/components/palette/BrowserDrawer";
import { CryptoModal } from "@/components/palette/CryptoModal";
import { OnboardingTour } from "@/components/palette/OnboardingTour";
import { FilesDrawer } from "@/components/palette/FilesDrawer";
import { StatusModal } from "@/components/palette/StatusModal";
import { SecurityModal } from "@/components/palette/SecurityModal";
import { PrivacyTermsModals } from "@/components/palette/PrivacyTermsModals";
import { FaqModal } from "@/components/palette/FaqModal";
import { RoomEntryDialog } from "@/components/palette/RoomEntryDialog";

export default function Home() {
  const view = useAnon((s) => s.view);
  const store = useAnon();
  // mirrors presence (name/color) into the live relay session when in a room
  useSync();

  // global keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      // ⌘K — always (even while typing)
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        store.togglePalette();
        return;
      }
      // ? — shortcuts overlay (only when not typing)
      if (e.key === "?" && !isTyping && !mod) {
        e.preventDefault();
        store.toggleShortcuts();
        return;
      }
      // esc — close any open overlay
      if (e.key === "Escape") {
        if (store.entryMode && !store.booting) { store.closeEntry(); return; }
        if (store.tourOpen) { store.dismissTour(); return; }
        if (store.slashOpen) { store.setSlashOpen(false); return; }
        if (store.paletteOpen) { store.togglePalette(); return; }
        if (store.shortcutsOpen) { store.toggleShortcuts(); return; }
        if (store.inviteOpen) { store.toggleInvite(); return; }
        if (store.settingsOpen) { store.toggleSettings(); return; }
        if (store.historyOpen) { store.toggleHistory(); return; }
        if (store.notificationsOpen) { store.toggleNotifications(); return; }
        if (store.generativeOpen) { store.toggleGenerative(); return; }
        if (store.browserOpen) { store.toggleBrowser(); return; }
        if (store.cryptoOpen) { store.toggleCrypto(); return; }
        if (store.filesOpen) { store.toggleFiles(); return; }
        if (store.statusOpen) { store.toggleStatus(); return; }
        if (store.securityOpen) { store.toggleSecurity(); return; }
        if (store.faqOpen) { store.toggleFaq(); return; }
        return;
      }

      if (view !== "editor" || isTyping) return;

      if (mod && e.key === "j") {
        e.preventDefault();
        store.toggleChat();
      } else if (mod && e.key === "b") {
        e.preventDefault();
        store.toggleFiles();
      } else if (mod && e.key === ",") {
        e.preventDefault();
        store.toggleSettings();
      } else if (mod && e.key === "i") {
        e.preventDefault();
        store.toggleInvite();
      } else if (mod && e.key === ".") {
        e.preventDefault();
        store.toggleZen();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        store.toggleHistory();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        store.toggleMdPreview();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        store.startTour();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        store.toggleSyntaxHighlight();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.toggleStatus();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "x") {
        e.preventDefault();
        store.toggleSecurity();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        store.toggleFaq();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        store.toggleGenerative();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        store.toggleBrowser();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        store.exportProjectZip();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        store.toggleCrypto();
      } else if (mod && e.key === "Enter") {
        e.preventDefault();
        store.runCode();
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        store.toggleTerminal();
      } else if (mod && e.key === "n") {
        e.preventDefault();
        store.toggleNotifications();
      } else if (mod && e.key === "f") {
        e.preventDefault();
        store.toggleFind();
      } else if (mod && e.altKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        store.toggleFind();
      } else if (mod && e.key === "h" && !e.shiftKey) {
        // ⌘H handled by FindBar when open, skip here
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, store]);

  // first-run tip toast + auto-start tour
  useEffect(() => {
    if (view === "editor" && typeof window !== "undefined") {
      const seenTour = localStorage.getItem("anonshare.tour.seen");
      const seenTip = localStorage.getItem("anonshare.tip.cmdk");
      if (!seenTour && !store.tourDismissed) {
        setTimeout(() => store.startTour(), 800);
        localStorage.setItem("anonshare.tour.seen", "1");
      }
      if (!seenTip) {
        import("sonner").then(({ toast }) => {
          toast("Press ⌘K to open the command palette", {
            description: "Type / in the editor for slash commands. ⌘↵ runs code. ⌘⇧O restarts the tour.",
            duration: 6000,
          });
        });
        localStorage.setItem("anonshare.tip.cmdk", "1");
      }
    }
  }, [view, store]);

  return (
    <>
      {view === "landing" ? <Landing /> : <AppShell />}

      {/* global overlays — mounted at root so they float above everything */}
      <RoomEntryDialog />
      <CommandPalette />
      <ShortcutsOverlay />
      <InviteModal />
      <SettingsPanel />
      <HistoryDrawer />
      <NotificationsPanel />
      <GenerativeModal />
      <BrowserDrawer />
      <CryptoModal />
      <OnboardingTour />
      <FilesDrawer />
      <StatusModal />
      <SecurityModal />
      <PrivacyTermsModals />
      <FaqModal />
    </>
  );
}
