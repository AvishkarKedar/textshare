# anonshare — Design System & UI Specifications

> **Theme:** Minimalist Hacker Aesthetic · Monospace Precision · Tactile Hairline Grids  
> **Typography:** JetBrains Mono · Geist Mono · Geist Sans  
> **Supported Themes:** Obsidian (Default) · Dracula · Nord · Amber Terminal · Paper (Light)  

---

## 1. Design Philosophy & Aesthetic Principles

`anonshare` embraces a dense, uncompromising, terminal-inspired interface engineered for high-velocity coding and zero cognitive distraction.

### Core Visual Principles
1. **Sharp Corners Everywhere**: 0px border radius across all primary panels, tabs, modals, buttons, and inputs.
2. **Tactile Hairline Borders**: High-precision 1px borders (`hairline`, `hairline-b`, `hairline-r`, `hairline-t`, `hairline-l`) separating functional zones.
3. **Monospace Dominance**: Code, metadata, shortcuts, line numbers, and timestamps use monospace typography (`font-mono`, `anon-mono`).
4. **Instant Visual Feedback**: Active tabs, speaking avatars, running code buttons, and open drawers feature crisp visual rings (`anim-pulse-ring`), border highlights, and color transitions.
5. **No Decorative Bloat**: Zero unnecessary gradients, drop shadows, or marketing illustrations. Every visual element serves an operational purpose.

---

## 2. Color Palettes & Theme System (`src/lib/themes.ts`)

Themes are implemented via CSS custom properties on `:root` and `.theme-*` classes:

```css
/* Obsidian (Default Dark) */
--anon-bg: #090a0f;
--anon-panel: #0e111a;
--anon-raise: #151a26;
--anon-line: #1e2638;
--anon-line2: #2a354d;
--anon-fg: #dce3f2;
--anon-mut: #8b9bb4;
--anon-dim: #4d5b75;
--anon-accent: #3b82f6;
--anon-ok: #10b981;
--anon-warn: #f59e0b;
--anon-danger: #ef4444;

/* Dracula */
--anon-bg: #282a36;
--anon-panel: #21222c;
--anon-accent: #bd93f9;
--anon-fg: #f8f8f2;

/* Nord */
--anon-bg: #2e3440;
--anon-panel: #242933;
--anon-accent: #88c0d0;
--anon-fg: #eceff4;

/* Amber Terminal */
--anon-bg: #0d0a00;
--anon-panel: #1a1400;
--anon-accent: #f59e0b;
--anon-fg: #fbbf24;

/* Paper (Light) */
--anon-bg: #f8fafc;
--anon-panel: #ffffff;
--anon-accent: #2563eb;
--anon-fg: #0f172a;
```

---

## 3. Typography & Hierarchy

| Role | Font Family | Tailwind Class | Usage |
|---|---|---|---|
| **Code & Editor** | JetBrains Mono | `font-mono anon-mono` | Editor content, line numbers, code blocks, diffs |
| **Labels & Data** | Geist Mono | `font-mono text-xs anon-mono` | Status bar, timers, shortcut badges, tokens |
| **Headings & Body**| Geist Sans | `font-sans anon-sans` | Modal titles, FAQ questions, legal text |

---

## 4. Component Architecture & UI Elements

### 4.1 TopBar Navigation ([`TopBar.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/editor/TopBar.tsx))
- **Height**: 44px (`h-11`), fixed to top with `hairline-b`.
- **Left Zone**: Logo icon, 6-character room code badge (`font-mono text-xs px-2 py-1`), Room TTL badge (`10m`/`1h`/`24h`), and Quick Share button.
- **Center Zone**: Active online participant avatars with identity color circles, initials, and speaking indicator rings.
- **Right Zone**:
  - Run Code trigger (`⌘↵` with green indicator).
  - Voice Mesh toggle (`⌘⇧V` with live microphone icon).
  - Terminal toggle (`⌘\`).
  - Overflow dropdown menu for secondary tools.

### 4.2 TabBar & File Management ([`TabBar.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/editor/TabBar.tsx))
- **Tabs**: File name, language icon badge, and close button (`X`) when multiple files exist.
- **Active Tab**: Highlighted with `bg-[var(--anon-bg)] text-[var(--anon-fg)] hairline-r border-t-2 border-t-[var(--anon-accent)]`.
- **Add File**: Prominent `+` button in tab row.

### 4.3 Drawers (Right Slide-Over)
- **Components**: [`VoicePanel.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/palette/VoicePanel.tsx), [`FilesDrawer.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/palette/FilesDrawer.tsx), [`HistoryDrawer.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/palette/HistoryDrawer.tsx), [`BookmarksDrawer.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/palette/BookmarksDrawer.tsx).
- **Width**: `w-full max-w-sm sm:max-w-md` with full viewport height.
- **Animation**: Smooth 220ms spring ease `[0.22, 0.61, 0.36, 1]` from right edge.
- **Backdrop**: Semi-transparent black backdrop (`bg-black/40`) with click-to-dismiss.

### 4.4 Centered Modals & Overlays
- **Components**: [`CommandPalette.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/palette/CommandPalette.tsx), [`CryptoModal.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/palette/CryptoModal.tsx), [`SecurityModal.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/palette/SecurityModal.tsx), [`StatusModal.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/palette/StatusModal.tsx), [`FaqModal.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/palette/FaqModal.tsx), [`WhiteboardModal.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/palette/WhiteboardModal.tsx).
- **Positioning**: Absolute center on screen (`fixed inset-0 flex items-center justify-center p-4`).
- **Max Width**: `max-w-xl` to `max-w-2xl` with scrollable body (`anon-scroll`).

---

## 5. Mobile & Touch Screen Responsive Design

```
+------------------------------------------+
|  TopBar: Room Code · Avatars · Voice · ☰  |
+------------------------------------------+
|  TabBar: [index.ts X] [style.css X] [+]  |
+------------------------------------------+
|                                          |
|            CodeMirror Editor             |
|                                          |
+------------------------------------------+
|  StatusBar: Ln 12, Col 4 · UTF-8 · TypeScript |
+------------------------------------------+
|  Mobile Bar (#mbar): Run · Chat · Files · More |
+------------------------------------------+
```

1. **Touch Target Sizing**: All mobile buttons, tab items, and icons have a minimum clickable hit area of `44x44px`.
2. **Mobile Action Bar (`#mbar`)**: A fixed bottom action bar on screens $< 640\text{px}$ providing immediate one-tap access to Run, Chat, Files, Voice, and Palette.
3. **No Hidden Action Buttons**: Mobile screens never hide action buttons behind desktop-only hover states; all buttons use `opacity-100 sm:opacity-0 sm:group-hover:opacity-100`.
4. **Viewport Fit**: Viewport meta includes `viewport-fit=cover` to respect mobile notches and safe areas.
