# anonshare — Comprehensive Design System & UI Specifications

> **Design Theme:** Minimalist Hacker Aesthetic · Monospace Precision · Tactile Hairline Grids  
> **Typography System:** JetBrains Mono · Geist Mono · Geist Sans  
> **Color Palettes:** Obsidian (Default Dark) · Dracula · Nord · Amber Terminal · Paper (Light)  

---

## 1. Aesthetic Manifesto & Visual Identity

`anonshare` is designed as a high-density, tactile pair-programming interface engineered for focused software development. It eliminates all decorative distractions, drop shadows, and rounded plastic UI components in favor of sharp 0px geometry, crisp monospace typography, and hairline grids.

### Core Visual Principles
1. **0px Border Radius**: All buttons, inputs, tabs, modal windows, tooltips, and panels feature sharp rectangular corners. (Avatars retain subtle 2px rounding for facial initials clarity).
2. **1px Tactile Hairlines**: Visual hierarchy is established using 1px solid hairline borders (`var(--anon-line)` and `var(--anon-line2)`).
3. **Monospace Dominance**: All operational text, code lines, timestamps, keyboard shortcuts, memory metrics, and room codes are rendered in monospace.
4. **Instant Action Feedback**: Interactive elements provide instant visual feedback through active background shifts (`var(--anon-raise)`), border color transitions, and animated glow rings (`anim-pulse-ring`).

---

## 2. Exhaustive Color Token System (`src/lib/themes.ts`)

```
+-----------------------------------------------------------------------------------------------------------------------+
|                                              Theme Color Tokens Matrix                                                |
+-------------------+---------------------+---------------------+---------------------+---------------------+-----------+
| Token Name        | Obsidian (Default)  | Dracula             | Nord                | Amber Terminal      | Paper     |
+-------------------+---------------------+---------------------+---------------------+---------------------+-----------+
| --anon-bg         | #090a0f (Base Dark) | #282a36 (Dark Grey) | #2e3440 (Polar Night| #0d0a00 (Pitch Black| #f8fafc   |
| --anon-panel      | #0e111a (Panel Dark)| #21222c (Deep Panel)| #242933 (Deep Night)| #1a1400 (Amber Dark)| #ffffff   |
| --anon-raise      | #151a26 (Raised)    | #2d303e (Raised)    | #3b4252 (Raised)    | #261e00 (Raised)    | #f1f5f9   |
| --anon-line       | #1e2638 (Border)    | #44475a (Border)    | #434c5e (Border)    | #332700 (Border)    | #e2e8f0   |
| --anon-line2      | #2a354d (Border Lt) | #6272a4 (Border Lt) | #4c566a (Border Lt) | #4d3b00 (Border Lt) | #cbd5e1   |
| --anon-fg         | #dce3f2 (Primary)   | #f8f8f2 (Primary)   | #eceff4 (Primary)   | #fbbf24 (Amber Gold)| #0f172a   |
| --anon-mut        | #8b9bb4 (Muted)     | #6272a4 (Muted)     | #d8dee9 (Muted)     | #d97706 (Amber Muted| #64748b   |
| --anon-dim        | #4d5b75 (Dimmed)    | #44475a (Dimmed)    | #4c566a (Dimmed)    | #92400e (Amber Dim) | #94a3b8   |
| --anon-accent     | #3b82f6 (Blue)      | #bd93f9 (Purple)    | #88c0d0 (Frost Blue)| #f59e0b (Amber Neon)| #2563eb   |
| --anon-ok         | #10b981 (Green)     | #50fa7b (Green)     | #a3be8c (Green)     | #10b981 (Green)     | #059669   |
| --anon-warn       | #f59e0b (Orange)    | #ffb86c (Orange)    | #ebcb8b (Yellow)    | #f59e0b (Orange)    | #d97706   |
| --anon-danger     | #ef4444 (Red)       | #ff5555 (Red)       | #bf616a (Red)       | #ef4444 (Red)       | #dc2626   |
+-------------------+---------------------+---------------------+---------------------+---------------------+-----------+
```

---

## 3. Typography & Hierarchy Standards

| Category | Font Family | Size / Line Height | Tracking | Purpose |
|---|---|---|---|---|
| **Code Editor** | JetBrains Mono | `13px / 1.6` | Normal | Active code buffer, CodeMirror, diff viewer |
| **Monospace Headings**| JetBrains Mono | `14px / 1.4` (Bold) | `+0.02em` | Panel titles, modal headers, command palette |
| **Status / Labels** | Geist Mono | `10px - 11px / 1.2` | `+0.05em` | Timestamps, TTL counters, shortcut pills |
| **Prose / FAQs** | Geist Sans | `13px - 14px / 1.5` | Normal | FAQ descriptions, security explanations, legal text |

---

## 4. Layering & Z-Index Stack Hierarchy

```
+---------------------------------------------------------------------------------+
| Z-Index Layer Map                                                               |
+---------------+-------------------+---------------------------------------------+
| Layer Index   | Tailwind Class    | Component Types                             |
+---------------+-------------------+---------------------------------------------+
| z-0           | z-0               | Background canvas, CodeMirror editor stage  |
| z-10          | z-10              | Tab bar, status bar, line numbers gutter    |
| z-20          | z-20              | TopBar navigation, sticky mobile action bar |
| z-30          | z-30              | Terminal panel, find/replace floating bar   |
| z-40          | z-40              | Right slide-over drawers (Voice, Files, etc)|
| z-50          | z-50              | Centered modals (Crypto, Faq, Whiteboard)   |
| z-60          | z-60              | Command palette fuzzy finder (⌘K)          |
| z-100         | z-[100]           | System toast notifications (Sonner Toaster) |
+---------------+-------------------+---------------------------------------------+
```

---

## 5. Exhaustive Component Layout Specifications

### 5.1 TopBar Navigation ([`TopBar.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/editor/TopBar.tsx))
- **Height**: Fixed 44px (`h-11`), pinned to top with `hairline-b`.
- **Left Zone**:
  - Logo vector with monospace brand name.
  - Room Code Pill: `font-mono text-xs px-2.5 py-1 bg-[var(--anon-panel)] hairline text-[var(--anon-fg)]`.
  - Room TTL Counter: Interactive badge cycling `10m` $\rightarrow$ `1h` $\rightarrow$ `24h`.
  - Quick Invite / Share button (`⌘I`).
- **Center Zone**:
  - Live peer avatars with assigned identity colors and initials (`initials(name)`).
  - Web Audio speaking pulse rings (`anim-pulse-ring`).
- **Right Zone**:
  - **Run Button**: `bg-[var(--anon-ok)] text-black px-3 py-1 font-mono text-xs font-semibold` with `⌘↵` indicator.
  - **Voice Button**: Live mic status icon (`Mic` / `MicOff`) and pulse indicator.
  - **Terminal Toggle**: `⌘\` hotkey button.
  - **Overflow Dropdown Menu**: Accessible secondary tool trigger.

### 5.2 Multi-File TabBar ([`TabBar.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/editor/TabBar.tsx))
- **Height**: 36px (`h-9`), pinned below TopBar with `hairline-b`.
- **Tab Layout**:
  - Inactive tab: `px-3 py-1.5 font-mono text-xs text-[var(--anon-mut)] hairline-r hover:bg-[var(--anon-raise)]`.
  - Active tab: `px-3 py-1.5 font-mono text-xs text-[var(--anon-fg)] bg-[var(--anon-bg)] hairline-r border-t-2 border-t-[var(--anon-accent)]`.
  - Close button: `X` icon button (`h-3 w-3`) rendered with `hover:text-[var(--anon-danger)]` when 2+ files exist.
  - Add Tab button: `+` icon button appending a new file buffer.

### 5.3 WebRTC Voice Panel ([`VoicePanel.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/palette/VoicePanel.tsx))
- **Width**: Responsive slide-over drawer `w-full max-w-sm sm:max-w-md hairline-l`.
- **Connection Header**: Displays WebRTC DTLS-SRTP P2P connection badge with real active peer count.
- **Audio Level Meter**:
  - 100-step linear level bar reading directly from Web Audio `AnalyserNode`.
  - Color gradient: Green ($< 30\%$), Amber ($30\% - 65\%$), Red ($> 65\%$).
- **Controls Grid**:
  - Large **Hold to Talk** push-to-talk button (`h-16`).
  - **Mute / Unmute** toggle button with red active badge.
  - **Deafen / Undeafen** toggle button with amber active badge.
- **Participant Roster**: Live peer list displaying avatar initials, real speaking state, and mute status.

### 5.4 Status Bar & Interactive Language Picker ([`StatusBar.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/editor/StatusBar.tsx))
- **Height**: Fixed 28px (`h-7`), pinned to bottom with `hairline-t`.
- **Left Zone**:
  - Relay connection health indicator with pulsating color dot (`synced`, `connected`, `reconnecting`, `offline`).
  - Peer presence indicator with live relay count badge.
  - E2EE zero-knowledge lock badge (`Lock` icon).
  - Room lock / read-only badge when restricted by owner.
  - One-click FAQ & Help trigger (`⌘⇧F`).
  - Piped program input (stdin) readiness chip (`in:N lines`).
- **Right Zone**:
  - **Interactive Language Selector**: Clickable button opening popover with instant switching across 15+ languages (Python, JavaScript, TypeScript, C, C++, Java, Rust, Go, Bash, HTML, CSS, JSON, Markdown, SQL, Text). Selecting a language automatically re-routes compiler execution and renames the file extension.
  - Live room TTL remaining timer (`10m`, `1h`, `24h`).
  - Live line, column, and selection counter (`ln X, col Y · Z selected`).

---

## 6. Mobile & Touch Screen Responsive System

```
+------------------------------------------+
|  TopBar: Room Code · Avatars · Voice · ☰  |
+------------------------------------------+
|  TabBar: [main.py X] [data.json X] [+]   |
+------------------------------------------+
|                                          |
|            CodeMirror Editor             |
|                                          |
+------------------------------------------+
|  StatusBar: Ln 1, Col 1 · Python · UTF-8 |
+------------------------------------------+
|  #mbar: [▶ Run] [💬 Chat] [📁 Files] [⌘] |
+------------------------------------------+
```

1. **Touch Target Constraint**: Every button, tab, and icon must maintain a minimum touch area of `44x44px`.
2. **Mobile Action Bar (`#mbar`)**: Fixed bottom navigation bar on mobile viewports ($< 640\text{px}$) offering one-tap triggers for Run, Chat, Files, Voice, and Palette.
3. **No Invisible Buttons**: Mobile interfaces strictly employ `opacity-100 sm:opacity-0 sm:group-hover:opacity-100` to ensure full button visibility without requiring desktop mouse hover.
