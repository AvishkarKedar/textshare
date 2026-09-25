"use client";

import { useAnon } from "@/lib/store";
import { TopBar } from "./TopBar";
import { TabBar } from "./TabBar";
import { EditorStage } from "./EditorStage";
import { StatusBar } from "./StatusBar";
import { ChatSidebar } from "./ChatSidebar";
import { MobileNav } from "./MobileNav";
import { TerminalDrawer } from "./TerminalDrawer";
import { MarkdownPreview } from "./MarkdownPreview";
import { GoalBanner } from "./GoalBanner";
import { FindBar } from "./FindBar";

export function AppShell() {
  const s = useAnon();
  return (
    <div className="flex h-screen flex-col">
      <TopBar />
      {!s.zenMode && <TabBar />}
      {s.goalText && <GoalBanner />}
      {s.findOpen && <FindBar />}
      <div className="flex min-h-0 flex-1">
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <EditorStage />
            {s.mdPreviewOpen && <MarkdownPreview />}
          </div>
          {s.terminalOpen && <TerminalDrawer />}
        </main>
        <ChatSidebar />
      </div>
      <StatusBar />
      {/* spacer — reserves room for the fixed mobile nav + symbol-key bar
          (and the iOS home indicator) so the StatusBar stays visible. */}
      <div
        aria-hidden
        className="flex-none md:hidden"
        style={{ height: "calc(88px + env(safe-area-inset-bottom, 0px))" }}
      />
      <MobileNav />
    </div>
  );
}
