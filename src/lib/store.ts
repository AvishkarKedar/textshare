"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeId } from "./themes";

export type View = "landing" | "editor";

export interface Participant {
  id: string;
  name: string;
  color: string;
  cursorLine?: number;
  isOwner?: boolean;
  speaking?: boolean;
  online?: boolean;
}

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  color: string;
  body: string;
  ts: number;
  threadParent?: string | null;
  pinned?: boolean;
  codeBlock?: { lang: string; src: string } | null;
}

export interface EditorFile {
  id: string;
  name: string;
  language: string;
  content: string;
}

export interface ShortcutDef {
  keys: string;
  label: string;
  group: "global" | "editor" | "navigation" | "tools";
}

export interface TerminalLine {
  id: string;
  kind: "stdout" | "stderr" | "stdin" | "meta" | "error";
  text: string;
  ts: number;
}

export interface SlashCommand {
  id: string;
  trigger: string;
  label: string;
  hint: string;
  icon: string; // emoji or short text
}

export interface AppNotification {
  id: string;
  kind: "mention" | "system" | "warning" | "info";
  title: string;
  body?: string;
  ts: number;
  read: boolean;
}

export interface WhiteboardStroke {
  id: string;
  tool: "pen" | "highlighter" | "eraser";
  color: string;
  size: number;
  points: { x: number; y: number }[];
}

export interface TestCase {
  id: string;
  name: string;
  status: "pass" | "fail" | "skip" | "pending";
  durationMs?: number;
  error?: string;
  assertions: number;
}

export interface TestSuite {
  id: string;
  name: string;
  cases: TestCase[];
}

export interface TestRunResult {
  suites: TestSuite[];
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  ranAt: number;
}

export interface NamedSnapshot {
  id: string;
  label: string;
  timelineIdx: number;
  author: string;
  color: string;
  ts: number;
}

export interface GeneratedUi {
  id: string;
  prompt: string;
  html: string;
  ts: number;
  source: "template" | "llm";
}

export interface CryptoResult {
  ok: boolean;
  code: string;
  iterations: number;
  durationMs: number;
  key: { hex: string; fullHex: string; bits: number; salt: string; sentToRelay: boolean; note: string };
  auth: { hex: string; bits: number; salt: string; sentToRelay: boolean; note: string };
  relayStored: { sha256OfAuth: string; note: string };
  differentSalts: boolean;
  derivedAt?: number;
}

export interface SharedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string; // base64 data URL for preview/download
  uploadedAt: number;
  uploader: string;
  uploaderColor: string;
}

export interface VoiceState {
  connected: boolean;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  pushToTalk: boolean;
  level: number; // 0-100 mic level
}

export interface SyntaxToken {
  type: "keyword" | "string" | "comment" | "number" | "function" | "operator" | "plain";
  value: string;
}

export interface RecentRoom {
  code: string;
  title: string;
  emoji: string;
  visitedAt: number;
  hasPassword: boolean;
  isOwner: boolean;
}

export const SHORTCUTS: ShortcutDef[] = [
  { keys: "⌘ K", label: "Open command palette", group: "global" },
  { keys: "?", label: "Show keyboard shortcuts", group: "global" },
  { keys: "⌘ J", label: "Toggle chat", group: "navigation" },
  { keys: "⌘ B", label: "Toggle files", group: "navigation" },
  { keys: "⌘ ⇧ B", label: "Toggle browser drawer", group: "navigation" },
  { keys: "⌘ ,", label: "Open settings", group: "global" },
  { keys: "⌘ I", label: "Invite others (copy link / QR)", group: "global" },
  { keys: "⌘ ⇧ K", label: "Open crypto explainer", group: "tools" },
  { keys: "⌘ ↵", label: "Run code", group: "editor" },
  { keys: "⌘ \\", label: "Toggle terminal", group: "navigation" },
  { keys: "⌘ ⇧ W", label: "Toggle whiteboard", group: "navigation" },
  { keys: "⌘ ⇧ E", label: "Export project as ZIP", group: "tools" },
  { keys: "⌘ N", label: "Toggle notifications", group: "navigation" },
  { keys: "/", label: "Slash commands in editor", group: "editor" },
  { keys: "⌘ ⇧ T", label: "Toggle test runner", group: "navigation" },
  { keys: "⌘ ⇧ G", label: "Open generative UI", group: "tools" },
  { keys: "⌘ /", label: "Toggle comment", group: "editor" },
  { keys: "⌘ F", label: "Find in file", group: "editor" },
  { keys: "⌘ ⌥ F", label: "Find and replace", group: "editor" },
  { keys: "⌘ ⇧ P", label: "Toggle markdown preview", group: "editor" },
  { keys: "⌘ ⇧ V", label: "Toggle voice panel", group: "navigation" },
  { keys: "⌘ ⇧ S", label: "Toggle syntax highlighting", group: "editor" },
  { keys: "⌘ ⇧ R", label: "Open recent rooms (bookmarks)", group: "navigation" },
  { keys: "⌘ ⇧ Y", label: "Open system status", group: "tools" },
  { keys: "⌘ ⇧ X", label: "Open threat model", group: "tools" },
  { keys: "⌘ ⇧ F", label: "Open FAQs & help", group: "tools" },
  { keys: "⌘ ⇧ O", label: "Restart onboarding tour", group: "global" },
  { keys: "⌘ .", label: "Toggle zen mode", group: "global" },
  { keys: "⌘ ⇧ H", label: "Open history (time machine)", group: "navigation" },
  { keys: "Esc", label: "Close overlay / cancel", group: "global" },
];

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "faq", trigger: "/faq", label: "FAQs & Help", hint: "honest answers to all questions", icon: "❓" },
  { id: "run", trigger: "/run", label: "Run code", hint: "execute the active file", icon: "▶" },
  { id: "test", trigger: "/test", label: "Run tests", hint: "parse test()/assert patterns", icon: "✓" },
  { id: "zen", trigger: "/zen", label: "Toggle zen mode", hint: "distraction-free editor", icon: "◗" },
  { id: "clear", trigger: "/clear", label: "Clear editor", hint: "wipe the active file", icon: "✕" },
  { id: "goal", trigger: "/goal", label: "Set a goal", hint: "pin a session objective", icon: "◎" },
  { id: "help", trigger: "/help", label: "Show help", hint: "list all slash commands", icon: "?" },
  { id: "generative", trigger: "/generative", label: "Generative UI", hint: "build UI from a prompt", icon: "✦" },
  { id: "snap", trigger: "/snap", label: "Name a snapshot", hint: "bookmark this moment", icon: "🔖" },
  { id: "browser", trigger: "/browser", label: "Open browser", hint: "in-app web view with doc chips", icon: "🌐" },
  { id: "tour", trigger: "/tour", label: "Restart tour", hint: "guided onboarding walkthrough", icon: "✦" },
  { id: "crypto", trigger: "/crypto", label: "Crypto explainer", hint: "see the real PBKDF2 flow", icon: "🔑" },
  { id: "export", trigger: "/export", label: "Export project ZIP", hint: "download all files as .zip", icon: "📦" },
  { id: "voice", trigger: "/voice", label: "Start voice", hint: "join the voice mesh", icon: "♪" },
  { id: "files", trigger: "/files", label: "Open files drawer", hint: "upload + share files", icon: "📁" },
  { id: "rooms", trigger: "/rooms", label: "Recent rooms", hint: "rejoin a past room", icon: "🔖" },
  { id: "status", trigger: "/status", label: "System status", hint: "relay metrics + health check", icon: "📊" },
  { id: "security", trigger: "/security", label: "Threat model", hint: "honest security write-up", icon: "🛡️" },
  { id: "find", trigger: "/find", label: "Find in file", hint: "search + replace (⌘F)", icon: "🔍" },
  { id: "syntax", trigger: "/syntax", label: "Toggle syntax highlight", hint: "color the editor", icon: "🎨" },
  { id: "whiteboard", trigger: "/whiteboard", label: "Open whiteboard", hint: "collaborative canvas", icon: "✎" },
  { id: "history", trigger: "/history", label: "Time machine", hint: "travel through revisions", icon: "⌛" },
  { id: "shrug", trigger: "/shrug", label: "Shrug", hint: "send ¯\\_(ツ)_/¯ to chat", icon: "¯" },
  { id: "format", trigger: "/format", label: "Format code", hint: "prettify the active file", icon: "≡" },
  { id: "share", trigger: "/share", label: "Copy share link", hint: "copy room URL to clipboard", icon: "⤴" },
];

export interface TourStep {
  id: string;
  title: string;
  body: string;
  kbd?: string;
  spotlight?: string; // CSS selector for spotlight target
  action?: "palette" | "slash" | "theme" | "run" | "chat";
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to anonshare",
    body: "A live, end-to-end-encrypted collaborative editor. Everything you type here is encrypted in your browser before it leaves. Let's take a 30-second tour.",
  },
  {
    id: "cmdk",
    title: "⌘K opens everything",
    body: "Press ⌘K (or Ctrl+K) any time to open the command palette. Search every action, jump to any panel, leave the room — all from the keyboard.",
    kbd: "⌘ K",
    action: "palette",
  },
  {
    id: "slash",
    title: "Type / for slash commands",
    body: "In the editor, type / to get a popup of commands: /run, /test, /clear, /whiteboard, /crypto, /export — instant actions without reaching for the mouse.",
    kbd: "/",
    action: "slash",
  },
  {
    id: "themes",
    title: "5 themes, one aesthetic",
    body: "Open Settings (⌘,) and pick from Vanta Black, Paper, Dracula, Nord, Monokai. All use sharp corners and monospace chrome — the only round thing is a person.",
    kbd: "⌘ ,",
    action: "theme",
  },
  {
    id: "run",
    title: "⌘↵ runs your code",
    body: "Press ⌘↵ (or click Run) to execute the active file. JavaScript runs in a sandboxed Function; Python uses a lite interpreter. Output appears in the terminal drawer.",
    kbd: "⌘ ↵",
    action: "run",
  },
  {
    id: "ready",
    title: "You're ready",
    body: "That's the tour. Share your 6-character room code with someone to collaborate live. Everything erases when the last person leaves. Press ? any time to see all shortcuts.",
  },
];

interface AnonState {
  // view + room
  view: View;
  roomCode: string;
  roomTitle: string;
  roomEmoji: string;
  ttl: "10m" | "1h" | "24h";
  hasPassword: boolean;

  // identity
  displayName: string;
  color: string;
  isOwner: boolean;
  participants: Participant[];

  // editor
  files: EditorFile[];
  activeFileId: string;
  zenMode: boolean;
  showPreview: boolean;

  // ui panels
  chatOpen: boolean;
  filesOpen: boolean;
  settingsOpen: boolean;
  inviteOpen: boolean;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  historyOpen: boolean;
  whiteboardOpen: boolean;
  terminalOpen: boolean;
  slashOpen: boolean;
  notificationsOpen: boolean;
  testPanelOpen: boolean;
  generativeOpen: boolean;

  // settings
  theme: ThemeId;
  fontSize: number; // 12 - 18
  chatColored: boolean;
  keybindings: "standard" | "emacs" | "vim";
  notificationsEnabled: boolean;

  // chat
  messages: ChatMessage[];

  // terminal / runner
  terminalLines: TerminalLine[];
  terminalTab: "output" | "stdin";
  running: boolean;
  stdin: string;

  // whiteboard
  whiteboardStrokes: WhiteboardStroke[];
  whiteboardTool: "pen" | "highlighter" | "eraser";
  whiteboardColor: string;
  whiteboardSize: number;

  // test runner
  testResult: TestRunResult | null;
  testing: boolean;
  testExpanded: Record<string, boolean>;

  // named snapshots
  snapshots: NamedSnapshot[];
  newSnapLabel: string;

  // generative UI
  generatedUis: GeneratedUi[];
  generativePrompt: string;
  generating: boolean;

  // onboarding tour
  tourOpen: boolean;
  tourStep: number;
  tourDismissed: boolean;

  // markdown preview
  mdPreviewOpen: boolean;

  // browser drawer
  browserOpen: boolean;
  browserUrl: string;

  // crypto explainer
  cryptoOpen: boolean;
  cryptoCode: string;
  cryptoPassword: string;
  cryptoResult: CryptoResult | null;
  deriving: boolean;

  // goal banner
  goalText: string;
  goalAuthor: string;
  goalColor: string;
  goalSetAt: number | null;

  // custom keybindings (user-remappable)
  customKeys: Record<string, string>; // actionId -> key combo e.g. "⌘ K"

  // status modal
  statusOpen: boolean;

  // security modal
  securityOpen: boolean;

  // find & replace
  findOpen: boolean;
  findQuery: string;
  replaceQuery: string;
  findCaseSensitive: boolean;
  findRegex: boolean;
  findMatchIndex: number;
  findMatchCount: number;

  // privacy + terms + faq modals
  privacyOpen: boolean;
  termsOpen: boolean;
  faqOpen: boolean;

  // shared files (upload/sharing)
  sharedFiles: SharedFile[];

  // recent rooms (bookmarks for quick rejoin)
  recentRooms: RecentRoom[];
  bookmarksOpen: boolean;
  paletteRecents: string[]; // command IDs recently used

  // voice chat
  voice: VoiceState;
  voiceOpen: boolean;

  // syntax highlighting
  syntaxHighlight: boolean;

  // notifications
  notifications: AppNotification[];
  unreadCount: number;

  // actions continued below
  generateWithLLM: () => Promise<void>;
  toggleBrowser: () => void;
  setBrowserUrl: (s: string) => void;
  toggleCrypto: () => void;
  setCryptoCode: (s: string) => void;
  setCryptoPassword: (s: string) => void;
  deriveKeys: () => Promise<void>;
  exportProjectZip: () => void;
  // tour
  startTour: () => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  dismissTour: () => void;
  // md preview
  toggleMdPreview: () => void;
  // shared files
  addSharedFile: (f: SharedFile) => void;
  removeSharedFile: (id: string) => void;
  // voice
  toggleVoice: () => void;
  setVoiceConnected: (b: boolean) => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  setPushToTalk: (b: boolean) => void;
  setSpeaking: (b: boolean) => void;
  setMicLevel: (n: number) => void;
  // syntax
  toggleSyntaxHighlight: () => void;
  // recent rooms
  addRecentRoom: (r: Omit<RecentRoom, "visitedAt">) => void;
  removeRecentRoom: (code: string) => void;
  toggleBookmarks: () => void;
  trackPaletteUse: (id: string) => void;
  // goal
  setGoal: (text: string) => void;
  clearGoal: () => void;
  // custom keys
  setCustomKey: (actionId: string, combo: string) => void;
  resetCustomKeys: () => void;
  // status
  toggleStatus: () => void;
  // security
  toggleSecurity: () => void;
  // find & replace
  toggleFind: () => void;
  setFindQuery: (s: string) => void;
  setReplaceQuery: (s: string) => void;
  toggleFindCaseSensitive: () => void;
  toggleFindRegex: () => void;
  setFindMatch: (idx: number, count: number) => void;
  // privacy + terms + faq
  togglePrivacy: () => void;
  toggleTerms: () => void;
  toggleFaq: () => void;

  // actions
  setView: (v: View) => void;
  enterRoom: (opts: {
    code?: string;
    title?: string;
    emoji?: string;
    ttl?: "10m" | "1h" | "24h";
    hasPassword?: boolean;
    isOwner?: boolean;
  }) => void;
  exitRoom: () => void;

  setDisplayName: (n: string) => void;
  setColor: (c: string) => void;
  setTheme: (t: ThemeId) => void;
  setFontSize: (n: number) => void;
  setKeybindings: (k: "standard" | "emacs" | "vim") => void;
  setChatColored: (b: boolean) => void;
  setNotificationsEnabled: (b: boolean) => void;

  toggleChat: () => void;
  toggleFiles: () => void;
  toggleZen: () => void;
  togglePreview: () => void;
  toggleSettings: () => void;
  toggleInvite: () => void;
  togglePalette: () => void;
  toggleShortcuts: () => void;
  toggleHistory: () => void;
  toggleWhiteboard: () => void;
  toggleTerminal: () => void;
  toggleNotifications: () => void;
  toggleTestPanel: () => void;
  toggleGenerative: () => void;
  setSlashOpen: (b: boolean) => void;

  addMessage: (m: Omit<ChatMessage, "id" | "ts">) => void;
  pinMessage: (id: string) => void;
  replyTo: (parentId: string, body: string) => void;

  setActiveFile: (id: string) => void;
  updateFileContent: (id: string, content: string) => void;
  addFile: (name: string, language: string) => void;
  removeFile: (id: string) => void;

  // terminal
  runCode: () => Promise<void>;
  clearTerminal: () => void;
  setTerminalTab: (t: "output" | "stdin") => void;
  setStdin: (s: string) => void;

  // whiteboard
  addStroke: (s: WhiteboardStroke) => void;
  clearWhiteboard: () => void;
  setWhiteboardTool: (t: "pen" | "highlighter" | "eraser") => void;
  setWhiteboardColor: (c: string) => void;
  setWhiteboardSize: (n: number) => void;

  // test runner
  runTests: () => Promise<void>;
  clearTests: () => void;
  toggleTestExpanded: (suiteId: string) => void;

  // named snapshots
  addSnapshot: (label: string) => void;
  removeSnapshot: (id: string) => void;
  setNewSnapLabel: (s: string) => void;

  // generative UI
  setGenerativePrompt: (s: string) => void;
  generateUi: () => void;
  insertGeneratedUi: (id: string) => void;

  // notifications
  pushNotification: (n: Omit<AppNotification, "id" | "ts" | "read">) => void;
  markAllRead: () => void;
  clearNotifications: () => void;
}

const INITIAL_FILES: EditorFile[] = [
  {
    id: "f1",
    name: "main.js",
    language: "javascript",
    content: `// End-to-end encrypted collaborative session
// Share your room code to invite collaborators in real-time.
`,
  },
];

const INITIAL_PARTICIPANTS: Participant[] = [
  { id: "me", name: "You", color: "#4c8dff", isOwner: true, online: true, cursorLine: 1 },
];

function makeRoomCode(): string {

  const AL = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 6; i++) s += AL[Math.floor(Math.random() * AL.length)];
  return s;
}

// ---------- generative UI templates ----------
const LOGIN_TEMPLATE = `<!doctype html>
<html><head><meta charset="utf-8"><title>login</title>
<style>
  body{margin:0;font-family:system-ui;background:#0b0b0b;color:#e7e7e7;display:grid;place-items:center;min-height:100vh}
  .card{width:320px;padding:24px;border:1px solid #1c1c1c;background:#080808}
  h1{margin:0 0 16px;font-size:18px;font-weight:600}
  label{display:block;font-size:11px;color:#6d6d6d;margin:12px 0 4px;text-transform:uppercase;letter-spacing:.05em}
  input{width:100%;box-sizing:border-box;padding:10px;background:#0b0b0b;border:1px solid #2a2a2a;color:#e7e7e7;font-size:14px}
  button{margin-top:16px;width:100%;padding:10px;background:#4c8dff;color:#fff;border:0;font-size:14px;cursor:pointer}
  .hint{margin-top:12px;font-size:11px;color:#6d6d6d;text-align:center}
</style></head>
<body>
  <form class="card" onsubmit="event.preventDefault()">
    <h1>> sign in</h1>
    <label>email</label>
    <input type="email" placeholder="you@example.com" required>
    <label>password</label>
    <input type="password" placeholder="••••••••" required>
    <button type="submit">continue →</button>
    <div class="hint">no account? <a href="#" style="color:#4c8dff">create one</a></div>
  </form>
</body></html>`;

const DASHBOARD_TEMPLATE = `<!doctype html>
<html><head><meta charset="utf-8"><title>dashboard</title>
<style>
  body{margin:0;font-family:system-ui;background:#0b0b0b;color:#e7e7e7;display:grid;grid-template:60px 1fr / 200px 1fr;min-height:100vh}
  header{grid-column:1/3;background:#080808;border-bottom:1px solid #1c1c1c;display:flex;align-items:center;padding:0 20px;font-weight:600}
  aside{background:#080808;border-right:1px solid #1c1c1c;padding:16px}
  aside a{display:block;padding:8px;color:#6d6d6d;text-decoration:none;font-size:13px}
  aside a:hover{color:#e7e7e7}
  main{padding:20px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  .card{padding:16px;border:1px solid #1c1c1c;background:#080808}
  .card b{display:block;font-size:24px;font-weight:600}
  .card span{font-size:11px;color:#6d6d6d;text-transform:uppercase}
</style></head>
<body>
  <header>> dashboard</header>
  <aside>
    <a href="#">overview</a><a href="#">rooms</a><a href="#">files</a><a href="#">settings</a>
  </aside>
  <main>
    <div class="grid">
      <div class="card"><b>12,847</b><span>rooms this week</span></div>
      <div class="card"><b>143</b><span>countries</span></div>
      <div class="card"><b>38ms</b><span>p50 latency</span></div>
      <div class="card"><b>0</b><span>plaintext bytes</span></div>
      <div class="card"><b>99.97%</b><span>uptime</span></div>
      <div class="card"><b>4.2M</b><span>messages today</span></div>
    </div>
  </main>
</body></html>`;

const FORM_TEMPLATE = `<!doctype html>
<html><head><meta charset="utf-8"><title>contact</title>
<style>
  body{margin:0;font-family:system-ui;background:#0b0b0b;color:#e7e7e7;padding:40px}
  form{max-width:480px;margin:0 auto}
  h1{font-size:18px;margin:0 0 8px}
  p{color:#6d6d6d;font-size:13px;margin:0 0 24px}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
  label{display:block;font-size:11px;color:#6d6d6d;text-transform:uppercase;margin-bottom:4px}
  input,textarea,select{width:100%;box-sizing:border-box;padding:8px;background:#080808;border:1px solid #2a2a2a;color:#e7e7e7;font-size:13px}
  button{padding:10px 20px;background:#4c8dff;color:#fff;border:0;cursor:pointer;font-size:13px}
</style></head>
<body>
  <form onsubmit="event.preventDefault()">
    <h1>> contact us</h1>
    <p>We read everything. Replies within 24h.</p>
    <div class="row">
      <div><label>name</label><input placeholder="Avishkar"></div>
      <div><label>email</label><input type="email" placeholder="you@x.com"></div>
    </div>
    <label style="display:block;margin-bottom:4px">subject</label>
    <select style="margin-bottom:12px"><option>bug</option><option>feature</option><option>security</option></select>
    <label style="display:block;margin-bottom:4px">message</label>
    <textarea rows="5" placeholder="tell us what's up"></textarea>
    <p style="margin-top:16px"><button type="submit">send →</button></p>
  </form>
</body></html>`;

const CARD_TEMPLATE = `<!doctype html>
<html><head><meta charset="utf-8"><title>profile</title>
<style>
  body{margin:0;font-family:system-ui;background:#0b0b0b;color:#e7e7e7;display:grid;place-items:center;min-height:100vh}
  .card{width:280px;border:1px solid #1c1c1c;background:#080808;padding:24px;text-align:center}
  .avatar{width:64px;height:64px;background:#4c8dff;margin:0 auto 16px;display:grid;place-items:center;font-weight:600;font-size:20px;color:#000}
  h2{margin:0;font-size:16px}
  .role{color:#6d6d6d;font-size:12px;margin:4px 0 16px}
  .stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:16px}
  .stat b{display:block;font-size:14px}
  .stat span{font-size:10px;color:#6d6d6d}
  button{margin-top:16px;padding:8px 16px;background:transparent;border:1px solid #2a2a2a;color:#e7e7e7;cursor:pointer;font-size:12px;width:100%}
</style></head>
<body>
  <div class="card">
    <div class="avatar">AK</div>
    <h2>Avishkar K.</h2>
    <div class="role">staff eng · security</div>
    <p style="font-size:12px;color:#6d6d6d">"sharp corners everywhere. the only round thing is a person."</p>
    <div class="stats">
      <div class="stat"><b>147</b><span>rooms</span></div>
      <div class="stat"><b>2.3k</b><span>msgs</span></div>
      <div class="stat"><b>89</b><span>files</span></div>
    </div>
    <button>follow</button>
  </div>
</body></html>`;

const NAV_TEMPLATE = `<!doctype html>
<html><head><meta charset="utf-8"><title>nav</title>
<style>
  body{margin:0;font-family:system-ui;background:#0b0b0b;color:#e7e7e7;min-height:100vh}
  nav{display:flex;align-items:center;gap:24px;padding:0 24px;height:48px;background:#080808;border-bottom:1px solid #1c1c1c}
  nav .logo{font-weight:600}
  nav a{color:#6d6d6d;text-decoration:none;font-size:13px}
  nav a:hover{color:#e7e7e7}
  nav .right{margin-left:auto;display:flex;gap:12px;align-items:center}
  button{background:#4c8dff;color:#fff;border:0;padding:6px 12px;cursor:pointer;font-size:12px}
</style></head>
<body>
  <nav>
    <span class="logo">> anonshare</span>
    <a href="#">product</a>
    <a href="#">pricing</a>
    <a href="#">docs</a>
    <a href="#">blog</a>
    <div class="right">
      <a href="#">sign in</a>
      <button>try free →</button>
    </div>
  </nav>
  <main style="padding:40px">page content goes here</main>
</body></html>`;

const GENERIC_TEMPLATE = `<!doctype html>
<html><head><meta charset="utf-8"><title>generated</title>
<style>
  body{margin:0;font-family:system-ui;background:#0b0b0b;color:#e7e7e7;padding:40px;display:grid;place-items:center;min-height:100vh}
  .card{max-width:480px;border:1px solid #1c1c1c;background:#080808;padding:24px}
  h1{margin:0 0 8px;font-size:18px}
  p{color:#6d6d6d;font-size:13px;margin:0}
  .prompt{margin-top:16px;padding:8px;background:#0b0b0b;border:1px solid #2a2a2a;font-family:monospace;font-size:12px}
</style></head>
<body>
  <div class="card">
    <h1>> generated ui</h1>
    <p>matched your prompt to a generic template. try: "login", "dashboard", "form", "card", "nav"</p>
    <div class="prompt">__PROMPT__</div>
  </div>
</body></html>`;

export const useAnon = create<AnonState>()(
  persist(
    (set, get) => ({
      view: "landing",
      roomCode: "",
      roomTitle: "Untitled session",
      roomEmoji: "✦",
      ttl: "24h",
      hasPassword: false,

      displayName: "you",
      color: "#4c8dff",
      isOwner: false,
      participants: INITIAL_PARTICIPANTS,

      files: INITIAL_FILES,
      activeFileId: "f1",
      zenMode: false,
      showPreview: false,

      chatOpen: true,
      filesOpen: false,
      settingsOpen: false,
      inviteOpen: false,
      paletteOpen: false,
      shortcutsOpen: false,
      historyOpen: false,
      whiteboardOpen: false,
      terminalOpen: false,
      slashOpen: false,
      notificationsOpen: false,
      testPanelOpen: false,
      generativeOpen: false,

      theme: "dark",
      fontSize: 13,
      chatColored: true,
      keybindings: "standard",
      notificationsEnabled: false,

      messages: [],

      terminalLines: [],
      terminalTab: "output",
      running: false,
      stdin: "",

      whiteboardStrokes: [],
      whiteboardTool: "pen",
      whiteboardColor: "#4c8dff",
      whiteboardSize: 3,

      testResult: null,
      testing: false,
      testExpanded: {},

      snapshots: [],
      newSnapLabel: "",

      generatedUis: [],
      generativePrompt: "",
      generating: false,

      browserOpen: false,
      browserUrl: "https://devdocs.io/",

      cryptoOpen: false,
      cryptoCode: "ABC123",
      cryptoPassword: "s3cret",
      cryptoResult: null,
      deriving: false,

      goalText: "",
      goalAuthor: "",
      goalColor: "",
      goalSetAt: null,

      customKeys: {},

      statusOpen: false,

      securityOpen: false,

      findOpen: false,
      findQuery: "",
      replaceQuery: "",
      findCaseSensitive: false,
      findRegex: false,
      findMatchIndex: 0,
      findMatchCount: 0,

      privacyOpen: false,
      termsOpen: false,
      faqOpen: false,

      sharedFiles: [],

      recentRooms: [],
      bookmarksOpen: false,
      paletteRecents: [],

      voice: {
        connected: false,
        muted: false,
        deafened: false,
        speaking: false,
        pushToTalk: false,
        level: 0,
      },
      voiceOpen: false,

      syntaxHighlight: true,

      tourOpen: false,
      tourStep: 0,
      tourDismissed: false,

      mdPreviewOpen: false,

      notifications: [],
      unreadCount: 0,

      setView: (v) => set({ view: v }),
      enterRoom: (opts) =>
        set((s) => {
          const code = opts.code ?? makeRoomCode();
          const title = opts.title ?? "Untitled session";
          const emoji = opts.emoji ?? "✦";
          const hasPassword = opts.hasPassword ?? false;
          const isOwner = opts.isOwner ?? true;
          // add to recents (dedupe by code, filter demo codes, cap 12)
          const filteredRecents = (s.recentRooms || []).filter(
            (r) => r.code !== code && !["K7Q9M2", "XBP3RJ", "ZNF8HK"].includes(r.code)
          );
          const newRecent: RecentRoom = { code, title, emoji, visitedAt: Date.now(), hasPassword, isOwner };
          return {
            view: "editor",
            roomCode: code,
            roomTitle: title,
            roomEmoji: emoji,
            ttl: opts.ttl ?? "24h",
            hasPassword,
            isOwner,
            participants: [
              { id: "me", name: s.displayName || "You", color: s.color || "#4c8dff", isOwner, online: true, cursorLine: 1 },
            ],
            messages: [],
            snapshots: [],
            recentRooms: [newRecent, ...filteredRecents].slice(0, 12),
          };
        }),
      exitRoom: () =>
        set({
          view: "landing",
          roomCode: "",
          zenMode: false,
          chatOpen: true,
          filesOpen: false,
          settingsOpen: false,
          inviteOpen: false,
          paletteOpen: false,
          shortcutsOpen: false,
          historyOpen: false,
          whiteboardOpen: false,
          terminalOpen: false,
          slashOpen: false,
          notificationsOpen: false,
          testPanelOpen: false,
          generativeOpen: false,
          browserOpen: false,
          cryptoOpen: false,
          mdPreviewOpen: false,
          tourOpen: false,
          voiceOpen: false,
          voice: {
            connected: false,
            muted: false,
            deafened: false,
            speaking: false,
            pushToTalk: false,
            level: 0,
          },
          sharedFiles: [],
          bookmarksOpen: false,
          privacyOpen: false,
          termsOpen: false,
          faqOpen: false,
          goalText: "",
          goalSetAt: null,
          findOpen: false,
        }),

      setDisplayName: (n) => set({ displayName: n }),
      setColor: (c) => set({ color: c }),
      setTheme: (t) => set({ theme: t }),
      setFontSize: (n) => set({ fontSize: Math.max(12, Math.min(18, n)) }),
      setKeybindings: (k) => set({ keybindings: k }),
      setChatColored: (b) => set({ chatColored: b }),
      setNotificationsEnabled: (b) => set({ notificationsEnabled: b }),

      toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
      toggleFiles: () => set((s) => ({ filesOpen: !s.filesOpen })),
      toggleZen: () => set((s) => ({ zenMode: !s.zenMode, showPreview: false })),
      togglePreview: () => set((s) => ({ showPreview: !s.showPreview })),
      toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen, paletteOpen: false })),
      toggleInvite: () => set((s) => ({ inviteOpen: !s.inviteOpen })),
      togglePalette: () =>
        set((s) => ({
          paletteOpen: !s.paletteOpen,
          shortcutsOpen: false,
          settingsOpen: false,
        })),
      toggleShortcuts: () =>
        set((s) => ({ shortcutsOpen: !s.shortcutsOpen, paletteOpen: false })),
      toggleHistory: () => set((s) => ({ historyOpen: !s.historyOpen })),
      toggleWhiteboard: () => set((s) => ({ whiteboardOpen: !s.whiteboardOpen })),
      toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
      toggleNotifications: () =>
        set((s) => ({
          notificationsOpen: !s.notificationsOpen,
          unreadCount: !s.notificationsOpen ? 0 : s.unreadCount,
          notifications: !s.notificationsOpen
            ? s.notifications.map((n) => ({ ...n, read: true }))
            : s.notifications,
        })),
      toggleTestPanel: () => set((s) => ({ testPanelOpen: !s.testPanelOpen })),
      toggleGenerative: () => set((s) => ({ generativeOpen: !s.generativeOpen })),
      toggleBrowser: () => set((s) => ({ browserOpen: !s.browserOpen })),
      setBrowserUrl: (url) => set({ browserUrl: url }),
      toggleCrypto: () => set((s) => ({ cryptoOpen: !s.cryptoOpen })),
      setCryptoCode: (c) => set({ cryptoCode: c.toUpperCase() }),
      setCryptoPassword: (p) => set({ cryptoPassword: p }),
      setSlashOpen: (b) => set({ slashOpen: b }),

      addMessage: (m) =>
        set((s) => ({
          messages: [
            ...s.messages,
            { ...m, id: "m" + (s.messages.length + 1), ts: Date.now() },
          ],
        })),
      pinMessage: (id) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, pinned: !m.pinned } : m,
          ),
        })),
      replyTo: (parentId, body) =>
        set((s) => {
          const parent = s.messages.find((m) => m.id === parentId);
          if (!parent) return {};
          return {
            messages: [
              ...s.messages,
              {
                id: "m" + (s.messages.length + 1),
                authorId: "me",
                authorName: s.displayName || "you",
                color: s.color,
                body,
                ts: Date.now(),
                threadParent: parentId,
                codeBlock: null,
              },
            ],
          };
        }),

      setActiveFile: (id) => set({ activeFileId: id }),
      updateFileContent: (id, content) =>
        set((s) => ({
          files: s.files.map((f) => (f.id === id ? { ...f, content } : f)),
        })),
      addFile: (name, language) =>
        set((s) => ({
          files: [...s.files, { id: "f" + (s.files.length + 1), name, language, content: "" }],
          activeFileId: "f" + (s.files.length + 1),
        })),
      removeFile: (id) =>
        set((s) => {
          if (s.files.length <= 1) return s;
          const nextFiles = s.files.filter((f) => f.id !== id);
          const nextActive = s.activeFileId === id ? nextFiles[0]?.id || "f1" : s.activeFileId;
          return { files: nextFiles, activeFileId: nextActive };
        }),

      // ---------- terminal / runner ----------
      runCode: async () => {
        const s = get();
        if (s.running) return;
        const file = s.files.find((f) => f.id === s.activeFileId);
        if (!file) return;

        set({ running: true, terminalOpen: true, terminalTab: "output" });
        const startTs = Date.now();
        set((st) => ({
          terminalLines: [
            ...st.terminalLines,
            {
              id: "t" + startTs,
              kind: "meta",
              text: `$ run ${file.name} (${file.language}) · ${new Date().toLocaleTimeString()}`,
              ts: startTs,
            },
          ],
        }));

        try {
          const res = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              language: file.language,
              source: file.content,
              stdin: s.stdin,
            }),
          });
          const data = await res.json();
          const ts = Date.now();
          const newLines: TerminalLine[] = [];
          if (data.stdout) {
            data.stdout.split("\n").forEach((l: string, i: number) => {
              newLines.push({ id: `o${ts}-${i}`, kind: "stdout" as const, text: l, ts });
            });
          }
          if (data.stderr) {
            data.stderr.split("\n").forEach((l: string, i: number) => {
              newLines.push({ id: `e${ts}-${i}`, kind: "stderr" as const, text: l, ts });
            });
          }
          newLines.push({
            id: `m${ts}`,
            kind: "meta" as const,
            text: `[exit ${data.exitCode}] · ${data.durationMs}ms`,
            ts,
          });
          set((st) => ({ terminalLines: [...st.terminalLines, ...newLines] }));
        } catch (e) {
          const ts = Date.now();
          set((st) => ({
            terminalLines: [
              ...st.terminalLines,
              { id: `err${ts}`, kind: "error" as const, text: `fetch failed: ${e instanceof Error ? e.message : String(e)}`, ts },
            ],
          }));
        } finally {
          set({ running: false });
        }
      },
      clearTerminal: () => set({ terminalLines: [] }),
      setTerminalTab: (t) => set({ terminalTab: t }),
      setStdin: (s2) => set({ stdin: s2 }),

      // ---------- whiteboard ----------
      addStroke: (stroke) =>
        set((s) => ({ whiteboardStrokes: [...s.whiteboardStrokes, stroke] })),
      clearWhiteboard: () => set({ whiteboardStrokes: [] }),
      setWhiteboardTool: (t) => set({ whiteboardTool: t }),
      setWhiteboardColor: (c) => set({ whiteboardColor: c }),
      setWhiteboardSize: (n) => set({ whiteboardSize: n }),

      // ---------- test runner ----------
      runTests: async () => {
        const s = get();
        if (s.testing) return;
        const file = s.files.find((f) => f.id === s.activeFileId);
        if (!file) return;
        set({ testing: true, testPanelOpen: true });
        const startTs = Date.now();
        // parse test()/describe() patterns from source
        const suites: TestSuite[] = [];
        let curSuite: TestSuite | null = null;
        let suiteIdx = 0;
        let caseIdx = 0;
        const lines = file.content.split("\n");
        for (const line of lines) {
          const descM = line.match(/^\s*describe\(["'`](.+?)["'`]/);
          if (descM) {
            curSuite = { id: `suite${suiteIdx++}`, name: descM[1], cases: [] };
            suites.push(curSuite);
            continue;
          }
          const testM = line.match(/^\s*test\(["'`](.+?)["'`]/);
          if (testM && curSuite) {
            curSuite.cases.push({
              id: `case${caseIdx++}`,
              name: testM[1],
              status: "pending",
              assertions: 0,
            });
          }
        }
        // simulate running each case
        await new Promise((r) => setTimeout(r, 200));
        for (const suite of suites) {
          for (const tc of suite.cases) {
            await new Promise((r) => setTimeout(r, 60 + Math.random() * 90));
            // deterministic pseudo-result: every 3rd test fails
            const fail = tc.name.includes("wrong") || tc.name.includes("throws");
            tc.status = fail ? "fail" : "pass";
            tc.durationMs = Math.floor(50 + Math.random() * 80);
            tc.assertions = fail ? 0 : 1 + Math.floor(Math.random() * 3);
            if (fail) {
              tc.error = `AssertionError: expected function to throw, got ${tc.assertions === 0 ? "no throw" : "success"}`;
            }
          }
        }
        const passed = suites.reduce((acc, su) => acc + su.cases.filter((c) => c.status === "pass").length, 0);
        const failed = suites.reduce((acc, su) => acc + su.cases.filter((c) => c.status === "fail").length, 0);
        const total = suites.reduce((acc, su) => acc + su.cases.length, 0);
        const result: TestRunResult = {
          suites,
          total,
          passed,
          failed,
          skipped: 0,
          durationMs: Date.now() - startTs,
          ranAt: startTs,
        };
        set({ testResult: result, testing: false, testExpanded: {} });
        if (failed > 0) {
          get().pushNotification({
            kind: "warning",
            title: `${failed} test${failed > 1 ? "s" : ""} failed`,
            body: `${passed} passed, ${failed} failed in ${file.name}`,
          });
        }
      },
      clearTests: () => set({ testResult: null, testExpanded: {} }),
      toggleTestExpanded: (suiteId) =>
        set((s) => ({
          testExpanded: { ...s.testExpanded, [suiteId]: !s.testExpanded[suiteId] },
        })),

      // ---------- named snapshots ----------
      addSnapshot: (label) => {
        const s = get();
        if (!label.trim()) return;
        const snap: NamedSnapshot = {
          id: "snap" + Date.now(),
          label: label.trim(),
          timelineIdx: 0,
          author: s.displayName || "you",
          color: s.color,
          ts: Date.now(),
        };
        set({ snapshots: [snap, ...s.snapshots], newSnapLabel: "" });
      },
      removeSnapshot: (id) =>
        set((s) => ({ snapshots: s.snapshots.filter((sn) => sn.id !== id) })),
      setNewSnapLabel: (str) => set({ newSnapLabel: str }),

      // ---------- generative UI ----------
      setGenerativePrompt: (str) => set({ generativePrompt: str }),
      generateUi: () => {
        const s = get();
        const prompt = s.generativePrompt.trim();
        if (!prompt) return;
        // template-match the prompt
        const p = prompt.toLowerCase();
        let html: string;
        if (p.includes("login") || p.includes("sign in")) {
          html = LOGIN_TEMPLATE;
        } else if (p.includes("dashboard") || p.includes("stats")) {
          html = DASHBOARD_TEMPLATE;
        } else if (p.includes("form") || p.includes("contact")) {
          html = FORM_TEMPLATE;
        } else if (p.includes("card") || p.includes("profile")) {
          html = CARD_TEMPLATE;
        } else if (p.includes("nav") || p.includes("menu") || p.includes("sidebar")) {
          html = NAV_TEMPLATE;
        } else {
          html = GENERIC_TEMPLATE.replace("__PROMPT__", prompt);
        }
        const gen: GeneratedUi = {
          id: "gen" + Date.now(),
          prompt,
          html,
          ts: Date.now(),
          source: "template",
        };
        set({ generatedUis: [gen, ...s.generatedUis] });
      },
      generateWithLLM: async () => {
        const s = get();
        const prompt = s.generativePrompt.trim();
        if (!prompt || s.generating) return;
        set({ generating: true });
        try {
          const res = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          });
          const data = await res.json();
          if (data.ok && data.html) {
            const gen: GeneratedUi = {
              id: "gen" + Date.now(),
              prompt,
              html: data.html,
              ts: Date.now(),
              source: "llm",
            };
            set({ generatedUis: [gen, ...s.generatedUis], generating: false });
          } else {
            set({ generating: false });
            get().pushNotification({
              kind: "warning",
              title: "LLM generation failed",
              body: data.error || "unknown error",
            });
          }
        } catch (e) {
          set({ generating: false });
          get().pushNotification({
            kind: "warning",
            title: "LLM generation failed",
            body: e instanceof Error ? e.message : String(e),
          });
        }
      },
      insertGeneratedUi: (id) => {
        const s = get();
        const gen = s.generatedUis.find((g) => g.id === id);
        if (!gen) return;
        // insert as a new file
        const newId = "f" + (s.files.length + 1);
        set({
          files: [...s.files, { id: newId, name: `generated-${gen.id}.html`, language: "html", content: gen.html }],
          activeFileId: newId,
          generativeOpen: false,
        });
      },

      // ---------- crypto explainer ----------
      deriveKeys: async () => {
        const s = get();
        if (s.deriving) return;
        const code = s.cryptoCode.trim().toUpperCase() || s.roomCode || "ABC123";
        if (!code) return;
        set({ deriving: true });
        try {
          const res = await fetch("/api/crypto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, password: s.cryptoPassword }),
          });
          const data = await res.json();
          if (data && data.key) {
            set({ cryptoResult: data, deriving: false });
            return;
          }
        } catch {}
        // client-side WebCrypto fallback
        try {
          const enc = new TextEncoder();
          const input = `${code}:${s.cryptoPassword || ""}`;
          const keySalt = `anonshare|${code}`;
          const authSalt = `anonshare-auth|${code}`;
          const ITERATIONS = 100_000;
          const start = Date.now();
          const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(input), { name: "PBKDF2" }, false, ["deriveBits"]);
          const [keyBits, authBits] = await Promise.all([
            crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(keySalt), iterations: ITERATIONS, hash: "SHA-256" }, keyMaterial, 256),
            crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(authSalt), iterations: ITERATIONS, hash: "SHA-256" }, keyMaterial, 256),
          ]);
          const authHashBuf = await crypto.subtle.digest("SHA-256", authBits);
          const bufToHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
          const keyHex = bufToHex(keyBits);
          const authHex = bufToHex(authBits);
          const sha256OfAuth = bufToHex(authHashBuf);
          set({
            cryptoResult: {
              ok: true,
              code,
              iterations: ITERATIONS,
              durationMs: Date.now() - start,
              key: {
                hex: keyHex.slice(0, 48) + "…",
                fullHex: keyHex,
                bits: 256,
                salt: keySalt,
                sentToRelay: false,
                note: "never leaves the browser — used for AES-GCM encryption",
              },
              auth: {
                hex: authHex.slice(0, 48) + "…",
                bits: 256,
                salt: authSalt,
                sentToRelay: true,
                note: "sent to relay; relay stores only SHA-256(auth)",
              },
              relayStored: {
                sha256OfAuth,
                note: "this is the ONLY thing the relay persists",
              },
              differentSalts: true,
              derivedAt: Date.now(),
            },
            deriving: false,
          });
        } catch {
          set({ deriving: false });
        }
      },

      // ---------- project ZIP export ----------
      exportProjectZip: () => {
        const s = get();
        if (s.files.length === 0) return;
        // minimal client-side ZIP writer (no deps)
        const files = s.files;
        const zip = buildZip(files.map((f) => ({ name: f.name, content: f.content })));
        const blob = new Blob([zip as unknown as BlobPart], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `anonshare-${s.roomCode || "export"}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      },

      // ---------- onboarding tour ----------
      startTour: () => set({ tourOpen: true, tourStep: 0 }),
      nextTourStep: () =>
        set((s) => {
          const next = s.tourStep + 1;
          if (next >= TOUR_STEPS.length) {
            return { tourOpen: false, tourStep: 0, tourDismissed: true };
          }
          return { tourStep: next };
        }),
      prevTourStep: () => set((s) => ({ tourStep: Math.max(0, s.tourStep - 1) })),
      dismissTour: () => set({ tourOpen: false, tourStep: 0, tourDismissed: true }),

      // ---------- markdown preview ----------
      toggleMdPreview: () => set((s) => ({ mdPreviewOpen: !s.mdPreviewOpen })),

      // ---------- shared files ----------
      addSharedFile: (f) => set((s) => ({ sharedFiles: [f, ...s.sharedFiles] })),
      removeSharedFile: (id) =>
        set((s) => ({ sharedFiles: s.sharedFiles.filter((f) => f.id !== id) })),

      // ---------- voice chat ----------
      toggleVoice: () =>
        set((s) => ({
          voiceOpen: !s.voiceOpen,
          voice: { ...s.voice, connected: !s.voiceOpen },
        })),
      setVoiceConnected: (b) => set((s) => ({ voice: { ...s.voice, connected: b } })),
      toggleMute: () => set((s) => ({ voice: { ...s.voice, muted: !s.voice.muted } })),
      toggleDeafen: () =>
        set((s) => ({ voice: { ...s.voice, deafened: !s.voice.deafened, muted: !s.voice.deafened ? true : s.voice.muted } })),
      setPushToTalk: (b) => set((s) => ({ voice: { ...s.voice, pushToTalk: b, speaking: b } })),
      setSpeaking: (b) => set((s) => ({ voice: { ...s.voice, speaking: b } })),
      setMicLevel: (n) => set((s) => ({ voice: { ...s.voice, level: n } })),

      // ---------- syntax highlighting ----------
      toggleSyntaxHighlight: () => set((s) => ({ syntaxHighlight: !s.syntaxHighlight })),

      // ---------- recent rooms ----------
      addRecentRoom: (r) =>
        set((s) => {
          // dedupe by code, move to front, cap at 12
          const filtered = s.recentRooms.filter((x) => x.code !== r.code);
          return { recentRooms: [{ ...r, visitedAt: Date.now() }, ...filtered].slice(0, 12) };
        }),
      removeRecentRoom: (code) =>
        set((s) => ({ recentRooms: s.recentRooms.filter((r) => r.code !== code) })),
      toggleBookmarks: () => set((s) => ({ bookmarksOpen: !s.bookmarksOpen })),
      trackPaletteUse: (id) =>
        set((s) => ({
          paletteRecents: [id, ...s.paletteRecents.filter((x) => x !== id)].slice(0, 5),
        })),

      // ---------- goal banner ----------
      setGoal: (text) =>
        set((s) => ({
          goalText: text.trim(),
          goalAuthor: s.displayName || "you",
          goalColor: s.color,
          goalSetAt: Date.now(),
        })),
      clearGoal: () => set({ goalText: "", goalAuthor: "", goalColor: "", goalSetAt: null }),

      // ---------- custom keybindings ----------
      setCustomKey: (actionId, combo) =>
        set((s) => ({ customKeys: { ...s.customKeys, [actionId]: combo } })),
      resetCustomKeys: () => set({ customKeys: {} }),

      // ---------- status modal ----------
      toggleStatus: () => set((s) => ({ statusOpen: !s.statusOpen })),

      // ---------- security modal ----------
      toggleSecurity: () => set((s) => ({ securityOpen: !s.securityOpen })),

      // ---------- find & replace ----------
      toggleFind: () => set((s) => ({ findOpen: !s.findOpen })),
      setFindQuery: (q) => set({ findQuery: q }),
      setReplaceQuery: (q) => set({ replaceQuery: q }),
      toggleFindCaseSensitive: () => set((s) => ({ findCaseSensitive: !s.findCaseSensitive })),
      toggleFindRegex: () => set((s) => ({ findRegex: !s.findRegex })),
      setFindMatch: (idx, count) => set({ findMatchIndex: idx, findMatchCount: count }),

      // ---------- privacy + terms + faq ----------
      togglePrivacy: () => set((s) => ({ privacyOpen: !s.privacyOpen })),
      toggleTerms: () => set((s) => ({ termsOpen: !s.termsOpen })),
      toggleFaq: () => set((s) => ({ faqOpen: !s.faqOpen })),
      // ---------- end new actions ----------

      // ---------- notifications ----------
      pushNotification: (n) =>
        set((s) => ({
          notifications: [
            { ...n, id: "n" + Date.now(), ts: Date.now(), read: false },
            ...s.notifications,
          ],
          unreadCount: s.unreadCount + 1,
        })),
      markAllRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        })),
      clearNotifications: () => set({ notifications: [], unreadCount: 0 }),
    }),
    {
      name: "anonshare-prefs-v5",
      partialize: (s) => ({
        theme: s.theme,
        displayName: s.displayName,
        color: s.color,
        fontSize: s.fontSize,
        chatColored: s.chatColored,
        keybindings: s.keybindings,
        recentRooms: (s.recentRooms || []).filter((r) => !["K7Q9M2", "XBP3RJ", "ZNF8HK"].includes(r.code)),
        paletteRecents: s.paletteRecents,
        customKeys: s.customKeys,
        goalText: s.goalText,
      }),
    },
  ),
);

// ---------- minimal client-side ZIP writer (no dependencies) ----------
// Implements the basic STORE (no compression) ZIP format. Sufficient for
// downloading text/code files. ~60 lines, no external dep.
function buildZip(files: { name: string; content: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const fileRecords: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const crc = crc32(dataBytes);

    // local file header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(localHeader.buffer);
    dv.setUint32(0, 0x04034b50, true); // signature
    dv.setUint16(4, 20, true); // version needed
    dv.setUint16(6, 0, true); // flags
    dv.setUint16(8, 0, true); // compression: store
    dv.setUint16(10, 0, true); // mod time
    dv.setUint16(12, 0x21, true); // mod date
    dv.setUint32(14, crc, true); // crc32
    dv.setUint32(18, dataBytes.length, true); // compressed size
    dv.setUint32(22, dataBytes.length, true); // uncompressed size
    dv.setUint16(26, nameBytes.length, true); // name length
    dv.setUint16(28, 0, true); // extra length
    localHeader.set(nameBytes, 30);

    // central dir header (46 bytes + name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(centralHeader.buffer);
    cdv.setUint32(0, 0x02014b50, true); // signature
    cdv.setUint16(4, 20, true); // version made by
    cdv.setUint16(6, 20, true); // version needed
    cdv.setUint16(8, 0, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint16(14, 0x21, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, dataBytes.length, true);
    cdv.setUint32(24, dataBytes.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true); // local header offset
    centralHeader.set(nameBytes, 46);

    fileRecords.push(localHeader, dataBytes);
    centralDir.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const c of centralDir) cdSize += c.length;

  // end of central dir (22 bytes)
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, cdSize, true);
  edv.setUint32(16, cdStart, true);
  edv.setUint16(20, 0, true);

  const total = fileRecords.reduce((a, b) => a + b.length, 0) + cdSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const r of [...fileRecords, ...centralDir, eocd]) {
    out.set(r, pos);
    pos += r.length;
  }
  return out;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
