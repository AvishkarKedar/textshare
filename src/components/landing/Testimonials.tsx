"use client";

import { Code2, GraduationCap, FileCode2, MessageSquare } from "lucide-react";

const USE_CASES = [
  {
    icon: Code2,
    title: "Pair programming",
    body: "Spin up a room, drop the code in a chat, watch your partner's cursor move line by line. No repo, no setup, no friction.",
    accent: "var(--anon-accent)",
  },
  {
    icon: GraduationCap,
    title: "Interview practice",
    body: "Share a 6-character code over the call. Run Python, JS, C, C++, Java, Rust, Go, bash — eight languages, sandboxed, no install.",
    accent: "var(--anon-ok)",
  },
  {
    icon: FileCode2,
    title: "Sharing a quick snippet",
    body: "Faster than a gist, more private than a paste. Set a 10-minute TTL, paste, share, and the room is gone when you close the tab.",
    accent: "var(--anon-warn)",
  },
];

export { USE_CASES };
