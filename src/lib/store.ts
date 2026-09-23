"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeId } from "./themes";
import type { RoomExistsInfo, RoomStateFrame, ConnState } from "./relay";
import {
  createRoom as relayCreateRoom,
  joinRoom as relayJoinRoom,
  roomInfo as relayRoomInfo,
  relayHost,
  storeOwnerToken,
  loadOwnerToken,
  clearOwnerToken,
} from "./relay";
import {
  startSession,
  endSession,
  pushChat,
  updateFileText,
  addYFile,
  removeYFile,
  updateYFile,
  setGoal as sessionSetGoal,
  getSession,
  adminRoom,
} from "./session";
import { runJsTests } from "./test-runner";
import { detectLanguage, extToLang } from "./detect";

export type View = "landing" | "editor";
export type { RoomExistsInfo, RoomStateFrame, ConnState };

export interface Participant {
  id: string;
  name: string;
  color: string;
  cursorLine?: number;
  isOwner?: boolean;
  /** live typing indicator (encrypted awareness) */
  typing?: boolean;
  /** where the peer is typing — "editor" or "chat" */
  typingIn?: string;
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
  kind: "stdout" | "stderr" | "stdin" | "meta" | "error" | "hint";
  text: string;
  ts: number;
  /** Exit code for the final [exit N] meta line — colors it ok/danger. */
  exit?: number;
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
  /** id of the real history entry this snapshot bookmarks */
  historyId: string;
  author: string;
  color: string;
  ts: number;
}

/** One real, locally recorded document state (used by history + undo). */
export interface HistoryEntry {
  id: string;
  fileId: string;
  fileName: string;
  ts: number;
  content: string;
  author: string;
  color: string;
  authorId: string;
  label?: string;
}

export interface GeneratedUi {
  id: string;
  prompt: string;
  html: string;
  ts: number;
  source: "template" | "ai";
  model?: string;
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
  { keys: "⌘ ⇧ E", label: "Export project as ZIP", group: "tools" },
  { keys: "⌘ N", label: "Toggle notifications", group: "navigation" },
  { keys: "/", label: "Slash commands in editor", group: "editor" },
  { keys: "⌘ ⇧ T", label: "Toggle test runner", group: "navigation" },
  { keys: "⌘ ⇧ G", label: "Open generative UI", group: "tools" },
  { keys: "⌘ /", label: "Toggle line comment", group: "editor" },
  { keys: "⌘ D", label: "Duplicate line", group: "editor" },
  { keys: "Tab / ⇧ Tab", label: "Indent / outdent line or selection", group: "editor" },
  { keys: "⌘ F", label: "Find in file", group: "editor" },
  { keys: "⌘ ⌥ F", label: "Find and replace", group: "editor" },
  { keys: "⌘ ⇧ P", label: "Toggle markdown preview", group: "editor" },
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
  { id: "test", trigger: "/test", label: "Run tests", hint: "execute describe()/test() in the sandbox", icon: "✓" },
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
  { id: "files", trigger: "/files", label: "Open files drawer", hint: "upload + share files", icon: "📁" },
  { id: "rooms", trigger: "/rooms", label: "Recent rooms", hint: "rejoin a past room", icon: "🔖" },
  { id: "status", trigger: "/status", label: "System status", hint: "relay metrics + health check", icon: "📊" },
  { id: "security", trigger: "/security", label: "Threat model", hint: "honest security write-up", icon: "🛡️" },
  { id: "find", trigger: "/find", label: "Find in file", hint: "search + replace (⌘F)", icon: "🔍" },
  { id: "syntax", trigger: "/syntax", label: "Toggle syntax highlight", hint: "color the editor", icon: "🎨" },
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
    body: "In the editor, type / to get a popup of commands: /run, /test, /clear, /history, /crypto, /export — instant actions without reaching for the mouse.",
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
    body: "Press ⌘↵ (or click Run) to execute the active file. Code runs in a bubblewrap sandbox on the relay — Python, JS, C, C++, Java, Rust, Go, bash. Output appears in the terminal drawer.",
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

  // real-time sync status (from the relay client)
  syncState: ConnState;
  roomState: RoomStateFrame | null;
  canEdit: boolean;

  // room entry (create/join) dialog + boot flow
  entryMode: null | "create" | "join";
  entryCode: string;
  entryInfo: RoomExistsInfo | null;
  entryPassword: string;
  entryTtl: "10m" | "1h" | "24h";
  booting: boolean;
  bootError: string;

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
  terminalHeight: number;
  stdinOpen: boolean;
  running: boolean;
  stdin: string;

  // real document history (snapshots of what was actually in the editor)
  docHistory: HistoryEntry[];
  undoDepth: number; // how many steps back from the newest snapshot we are

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

  // live caret position for the status bar (real ln/col/selection)
  cursorPos: { line: number; col: number; sel: number };
  setCursorPos: (p: { line: number; col: number; sel: number }) => void;

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
  // syntax
  toggleSyntaxHighlight: () => void;
  // history
  recordHistory: (meta: { author: string; color: string; authorId: string }) => void;
  undoEdit: () => void;
  redoEdit: () => void;
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

  // real room lifecycle
  openEntryCreate: () => void;
  openEntryJoin: (code: string) => Promise<void>;
  closeEntry: () => void;
  setEntryPassword: (p: string) => void;
  setEntryTtl: (t: "10m" | "1h" | "24h") => void;
  submitEntry: () => Promise<void>;

  enterRoom: (opts: {
    code?: string;
    title?: string;
    emoji?: string;
    ttl?: "10m" | "1h" | "24h";
    hasPassword?: boolean;
    isOwner?: boolean;
  }) => void;
  exitRoom: () => void;

  /** Owner-only, real relay operations (POST /room/:code/admin). */
  deleteRoom: () => Promise<boolean>;
  lockRoom: () => Promise<boolean>;
  suspendRoom: () => Promise<boolean>;
  changeRoomTtl: () => Promise<boolean>;

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
  setFileLanguage: (id: string, language: string, newName?: string) => void;
  addFile: (name: string, language: string) => void;
  removeFile: (id: string) => void;

  // terminal
  runCode: () => Promise<void>;
  clearTerminal: () => void;
  setTerminalHeight: (h: number) => void;
  setStdinOpen: (v: boolean) => void;
  setStdin: (s: string) => void;

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

function sessionActive(): boolean {
  return getSession() !== null;
}

/* ---------------------------------------------------- real test harness */

/** C++-only includes / namespace markers (used to route .c files to g++). */
const CPP_SOURCE_RE =
  /#\s*include\s*<(?:iostream|bits\/stdc\+\+\.h|string|vector|map|unordered_map|multimap|set|unordered_set|queue|priority_queue|stack|deque|list|array|forward_list|memory|functional|algorithm|utility|numeric|random|regex|sstream|fstream|iomanip|chrono|thread|mutex|future|atomic|optional|variant|tuple|bitset)>|(?:\busing\s+namespace\s+std\b|\bstd\s*::)/;

/**
 * Wraps user code in a REAL test harness that executes describe()/test()
 * inside the sandbox runner. Every pass/fail, assertion count and duration
 * comes from actual execution — nothing is simulated.
 */
function buildTestHarness(source: string, lang: string): string {
  if (lang.startsWith("py")) {
    return `import json, time

__results = {"suites": []}
__cur = {"name": "default", "cases": []}
__results["suites"].append(__cur)
__registered = set()

def describe(name, fn=None):
    global __cur
    __cur = {"name": name, "cases": []}
    __results["suites"].append(__cur)
    if fn:
        fn()

def test(name, fn):
    __registered.add(id(fn))
    t0 = time.time()
    entry = {"name": name, "status": "pass", "assertions": 0, "error": None, "durationMs": 0}
    __cur["cases"].append(entry)
    try:
        fn()
        entry["status"] = "pass"
    except Exception as e:
        entry["status"] = "fail"
        entry["error"] = type(e).__name__ + ": " + str(e)
    entry["durationMs"] = round((time.time() - t0) * 1000)

${source}

# auto-collect pytest-style module-level test_* functions not already run
for __n in [n for n in list(globals()) if n.startswith("test_") and callable(globals()[n])]:
    __fn = globals()[__n]
    if id(__fn) not in __registered:
        test(__n, __fn)

print("__ANON_RESULTS__" + json.dumps(__results))
`;
  }

  // JavaScript — a minimal expect() plus describe/test that really run.
  return `const __results = { suites: [] };
let __cur = { name: "default", cases: [] };
__results.suites.push(__cur);

function __expect(entry, actual) {
  return {
    toBe: (exp) => { entry.assertions++; if (actual !== exp) throw new Error("expected " + JSON.stringify(exp) + ", got " + JSON.stringify(actual)); },
    toEqual: (exp) => { entry.assertions++; if (JSON.stringify(actual) !== JSON.stringify(exp)) throw new Error("expected " + JSON.stringify(exp) + ", got " + JSON.stringify(actual)); },
    toBeTruthy: () => { entry.assertions++; if (!actual) throw new Error("expected truthy, got " + JSON.stringify(actual)); },
    toBeFalsy: () => { entry.assertions++; if (actual) throw new Error("expected falsy, got " + JSON.stringify(actual)); },
    toContain: (n) => { entry.assertions++; const has = typeof actual === "string" ? actual.includes(n) : Array.isArray(actual) && actual.includes(n); if (!has) throw new Error("expected to contain " + JSON.stringify(n)); },
    toHaveLength: (n) => { entry.assertions++; if ((actual && actual.length) !== n) throw new Error("expected length " + n + ", got " + (actual && actual.length)); },
    toBeCloseTo: (n, digits = 2) => { entry.assertions++; if (Math.abs(actual - n) > Math.pow(10, -digits) / 2) throw new Error("expected ~" + n + ", got " + actual); },
    toThrow: () => { entry.assertions++; let threw = false; try { actual(); } catch (e) { threw = true; } if (!threw) throw new Error("expected function to throw"); },
  };
}

async function describe(name, fn) {
  __cur = { name, cases: [] };
  __results.suites.push(__cur);
  if (fn) await fn();
}

async function test(name, fn) {
  const t0 = Date.now();
  const entry = { name, status: "pass", assertions: 0, error: null, durationMs: 0 };
  __cur.cases.push(entry);
  try {
    await fn((a) => __expect(entry, a));
    entry.status = "pass";
  } catch (e) {
    entry.status = "fail";
    entry.error = String((e && e.message) || e);
  }
  entry.durationMs = Date.now() - t0;
}

function __report() {
  console.log("__ANON_RESULTS__" + JSON.stringify(__results));
}

(async () => {
${source}
})().then(() => __report(), (e) => { console.error(String((e && e.stack) || e)); __report(); });
`;
}

function describeRoomError(res: { ok: false; reason: string; status?: number; detail?: string }): string {
  switch (res.reason) {
    case "network": return "Could not reach the relay. Check your connection and retry.";
    case "busy": return "Too many requests from your network. Wait a minute and try again.";
    case "collision": return "Could not reserve a free room code. Please try again.";
    case "password": return "That password is not right for this room.";
    case "gone": return "This room no longer exists.";
    case "suspended": return "This room was suspended by its owner or the operator.";
    case "relay": return `The relay refused this request (HTTP ${res.status}${res.detail ? ", " + res.detail : ""}).`;
    default: return "Something went wrong setting up encryption. Reload and retry.";
  }
}

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

      syncState: "dead" as ConnState,
      roomState: null,
      canEdit: true,

      entryMode: null,
      entryCode: "",
      entryInfo: null,
      entryPassword: "",
      entryTtl: "1h",
      booting: false,
      bootError: "",

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
      terminalHeight: 240,
      stdinOpen: true,
      running: false,
      stdin: "",

      docHistory: [],
      undoDepth: 0,

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
      cursorPos: { line: 1, col: 1, sel: 0 },
      setCursorPos: (p) => set({ cursorPos: p }),
      findMatchCount: 0,

      privacyOpen: false,
      termsOpen: false,
      faqOpen: false,

      sharedFiles: [],

      recentRooms: [],
      bookmarksOpen: false,
      paletteRecents: [],

      syntaxHighlight: true,

      tourOpen: false,
      tourStep: 0,
      tourDismissed: false,

      mdPreviewOpen: false,

      notifications: [],
      unreadCount: 0,

      setView: (v) => set({ view: v }),
      // ---------- real room lifecycle ----------
      openEntryCreate: () =>
        set({ entryMode: "create", entryCode: "", entryInfo: null, entryPassword: "", entryTtl: "1h", bootError: "" }),

      openEntryJoin: async (code) => {
        const c = code.trim().toUpperCase();
        set({ entryMode: "join", entryCode: c, entryInfo: null, entryPassword: "", bootError: "", booting: true });
        const info = await relayRoomInfo(relayHost(), c);
        set({ booting: false });
        if (!info) {
          set({ entryMode: null, bootError: "" });
          get().pushNotification({
            kind: "warning",
            title: "Relay unreachable",
            body: "Could not check room " + c + ". Try again in a moment.",
          });
          return;
        }
        if (!info.exists) {
          set({
            entryMode: null,
            bootError: `Room ${c} does not exist (or it expired). Rooms erase when everyone leaves.`,
          });
          return;
        }
        if (info.suspended) {
          set({ entryMode: null, bootError: `Room ${c} is suspended by the server operator.` });
          return;
        }
        set({ entryInfo: info });
        // Passwordless rooms can be joined immediately.
        if (!info.hasPassword) {
          await get().submitEntry();
        }
      },

      closeEntry: () =>
        set({ entryMode: null, entryInfo: null, entryPassword: "", bootError: "", booting: false }),

      setEntryPassword: (p) => set({ entryPassword: p }),
      setEntryTtl: (t) => set({ entryTtl: t }),

      submitEntry: async () => {
        const s = get();
        if (s.booting || !s.entryMode) return;
        const mode = s.entryMode;
        set({ booting: true, bootError: "" });

        try {
          if (mode === "create") {
            const res = await relayCreateRoom(relayHost(), {
              password: s.entryPassword,
              ttl: s.entryTtl,
            });
            if (!res.ok) {
              set({ booting: false, bootError: describeRoomError(res) });
              return;
            }
            storeOwnerToken(res.code, res.owner);
            startSession({
              code: res.code,
              host: res.host,
              keys: res.keys,
              owner: res.owner,
              created: true,
              hasPassword: !!s.entryPassword,
              displayName: s.displayName,
              color: s.color,
            });
            get().enterRoom({
              code: res.code,
              title: "Untitled session",
              ttl: s.entryTtl,
              hasPassword: !!s.entryPassword,
              isOwner: true,
            });
            set({ entryMode: null, entryPassword: "", booting: false });
            return;
          }

          // join
          const code = s.entryCode.trim().toUpperCase();
          if (!code) {
            set({ booting: false, bootError: "Enter a room code." });
            return;
          }
          const owner = loadOwnerToken(code);
          const res = await relayJoinRoom(relayHost(), code, s.entryPassword, owner);
          if (!res.ok) {
            set({ booting: false, bootError: describeRoomError(res) });
            return;
          }
          startSession({
            code: res.code,
            host: res.host,
            keys: res.keys,
            owner: owner || null,
            created: false,
            hasPassword: !!(s.entryInfo?.hasPassword),
            displayName: s.displayName,
            color: s.color,
          });
          get().enterRoom({
            code: res.code,
            title: `Room ${res.code}`,
            hasPassword: !!(s.entryInfo?.hasPassword),
            isOwner: !!owner,
          });
          set({ entryMode: null, entryPassword: "", booting: false });
        } catch (e) {
          set({ booting: false, bootError: e instanceof Error ? e.message : String(e) });
        }
      },

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
          try {
            window.history.replaceState(null, "", `#${code}`);
          } catch { /* ignore */ }
          return {
            view: "editor",
            roomCode: code,
            roomTitle: title,
            roomEmoji: emoji,
            ttl: opts.ttl ?? s.ttl,
            hasPassword,
            isOwner,
            // Desktop opens with the chat rail; mobile keeps the editor
            // fullscreen (chat is a toggleable overlay there).
            chatOpen: typeof window !== "undefined" ? window.innerWidth >= 768 : true,
            participants: [
              { id: "me", name: s.displayName || "You", color: s.color || "#4c8dff", isOwner, online: true, cursorLine: 1 },
            ],
            messages: [],
            snapshots: [],
            docHistory: [],
            undoDepth: 0,
            recentRooms: [newRecent, ...filteredRecents].slice(0, 12),
          };
        }),
      exitRoom: () => {
        endSession();
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
          terminalOpen: false,
          slashOpen: false,
          notificationsOpen: false,
          testPanelOpen: false,
          generativeOpen: false,
          browserOpen: false,
          cryptoOpen: false,
          mdPreviewOpen: false,
          tourOpen: false,
          sharedFiles: [],
          bookmarksOpen: false,
          privacyOpen: false,
          termsOpen: false,
          faqOpen: false,
          goalText: "",
          goalSetAt: null,
          findOpen: false,
          docHistory: [],
          undoDepth: 0,
          syncState: "dead",
          roomState: null,
          canEdit: true,
          booting: false,
          bootError: "",
        });
      },

      /* ---- real owner room administration (relay POST /room/:code/admin) ---- */

      deleteRoom: async () => {
        const s = get();
        if (!s.isOwner || !s.roomCode) return false;
        const res = await adminRoom("delete");
        if (!res.ok) {
          import("sonner").then(({ toast }) =>
            toast.error("Delete failed on the relay", {
              description: res.error === "not_owner" ? "You are not this room's owner." : `relay said: ${res.error ?? "network error"}`,
              duration: 6000,
            }));
          return false;
        }
        // Relay closes every socket (incl. ours) with T_KILLED "deleted" and
        // purges the room + file chunks; also clear the local owner token so
        // the code can never be re-administered from this browser, then leave.
        clearOwnerToken(s.roomCode);
        import("sonner").then(({ toast }) =>
          toast.success("Room deleted", { description: "Contents erased for everyone; the code no longer works." }));
        get().exitRoom();
        return true;
      },

      lockRoom: async () => {
        const s = get();
        if (!s.isOwner) return false;
        const lock = !s.roomState?.locked;
        const res = await adminRoom("lock", lock);
        if (res.ok) {
          import("sonner").then(({ toast }) =>
            toast.success(lock ? "Room locked" : "Room unlocked", {
              description: lock ? "Collaborators can read but not edit." : "Collaborators can edit again.",
            }));
        }
        return res.ok;
      },

      suspendRoom: async () => {
        const s = get();
        if (!s.isOwner) return false;
        const suspend = !s.roomState?.suspended;
        const res = await adminRoom("suspend", suspend);
        if (res.ok) {
          import("sonner").then(({ toast }) =>
            toast.success(suspend ? "Room suspended" : "Room resumed", {
              description: suspend ? "Everyone else was disconnected until you resume." : "Peers can rejoin now.",
            }));
        }
        return res.ok;
      },

      changeRoomTtl: async () => {
        const s = get();
        if (!s.isOwner) return false;
        const ttls: ("10m" | "1h" | "24h")[] = ["10m", "1h", "24h"];
        const next = ttls[(ttls.indexOf(s.ttl) + 1) % ttls.length];
        const res = await adminRoom("ttl", next);
        if (res.ok) {
          set({ ttl: next });
          import("sonner").then(({ toast }) =>
            toast.success(`Room TTL changed to ${next} (live on the relay)`));
        }
        return res.ok;
      },

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

      addMessage: (m) => {
        // Local sends go through the E2EE Yjs doc; remote messages arrive
        // via the session mirror. If no session is active (shouldn't happen
        // in a room), keep a local-only fallback so the UI never dead-ends.
        if (sessionActive()) {
          pushChat(m.body, m.codeBlock ?? null);
          return;
        }
        set((s) => ({
          messages: [
            ...s.messages,
            { ...m, id: "m" + (s.messages.length + 1), ts: Date.now() },
          ],
        }));
      },
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
      updateFileContent: (id, content) => {
        if (sessionActive()) {
          updateFileText(id, content);
          return;
        }
        set((s) => ({
          files: s.files.map((f) => (f.id === id ? { ...f, content } : f)),
        }));
      },
      setFileLanguage: (id, language, newName) => {
        if (sessionActive()) {
          updateYFile(id, { language, name: newName });
          return;
        }
        set((s) => ({
          files: s.files.map((f) =>
            f.id === id ? { ...f, language, name: newName || f.name } : f
          ),
        }));
      },
      addFile: (name, language) => {
        const inferredLang = language && language !== "text" ? language : extToLang(name);
        if (sessionActive()) {
          const id = addYFile(name, inferredLang);
          set({ activeFileId: id });
          return;
        }
        const nextId = "f" + (get().files.length + 1);
        set((s) => ({
          files: [...s.files, { id: nextId, name, language: inferredLang, content: "" }],
          activeFileId: nextId,
        }));
      },
      removeFile: (id) => {
        if (sessionActive()) {
          removeYFile(id);
          return;
        }
        set((s) => {
          if (s.files.length <= 1) return s;
          const nextFiles = s.files.filter((f) => f.id !== id);
          const nextActive = s.activeFileId === id ? nextFiles[0]?.id || "f1" : s.activeFileId;
          return { files: nextFiles, activeFileId: nextActive };
        });
      },

      // ---------- terminal / runner ----------
      runCode: async () => {
        const s = get();
        if (s.running) return;
        const file = s.files.find((f) => f.id === s.activeFileId);
        if (!file) return;

        // Auto-detect / resolve language:
        let sendLang = (file.language || "").toLowerCase().trim();
        if (sendLang === "text" || !sendLang || sendLang === "txt") {
          const inferred = extToLang(file.name);
          if (inferred && inferred !== "text") {
            sendLang = inferred;
          } else {
            const det = detectLanguage(file.content);
            if (det.confidence > 0.4 && det.language !== "text") {
              sendLang = det.language;
            } else {
              sendLang = "python"; // Default fallback runner language
            }
          }
        }
        if (sendLang === "c" && CPP_SOURCE_RE.test(file.content)) {
          sendLang = "cpp";
        }
        if (sendLang === "typescript" || sendLang === "ts") {
          sendLang = "javascript";
        }

        // HTML, SVG, and Markdown files mount directly into the interactive Live Web Preview:
        if (sendLang === "html" || sendLang === "htm" || sendLang === "xml" || sendLang === "svg" || sendLang === "markdown" || sendLang === "md") {
          set({ mdPreviewOpen: true, terminalOpen: true });
          const ts = Date.now();
          set((st) => ({
            terminalLines: [
              ...st.terminalLines,
              {
                id: "t" + ts,
                kind: "meta",
                text: `$ render ${file.name} (${sendLang}) · live interactive preview mounted`,
                ts,
              },
              {
                id: "m" + ts,
                kind: "meta",
                text: `[exit 0] · 0ms`,
                ts,
                exit: 0,
              },
            ],
          }));
          return;
        }

        const cleanStdin = s.stdin ? s.stdin.replace(/\r\n/g, "\n").replace(/\r/g, "\n") : "";
        set({ running: true, terminalOpen: true, stdinOpen: true });
        const startTs = Date.now();
        const stdinLineCount = cleanStdin.trim() ? cleanStdin.split("\n").length : 0;
        set((st) => ({
          terminalLines: [
            ...st.terminalLines,
            {
              id: "t" + startTs,
              kind: "meta",
              text: `$ run ${file.name} (${sendLang}) · ${new Date().toLocaleTimeString()}`,
              ts: startTs,
            },
            ...(stdinLineCount > 0
              ? [
                  {
                    id: "si" + startTs,
                    kind: "stdin" as const,
                    text: `· stdin · ${stdinLineCount} line${stdinLineCount === 1 ? "" : "s"} piped in`,
                    ts: startTs,
                  },
                ]
              : []),
          ],
        }));

        try {
          const res = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              language: sendLang,
              source: file.content,
              stdin: cleanStdin,
            }),
          });
          const data = await res.json();
          const ts = Date.now();
          const newLines: TerminalLine[] = [];
          const outText = typeof data.stdout === "string" ? data.stdout : "";
          const errText = typeof data.stderr === "string" ? data.stderr : "";
          const exitCode = typeof data.exitCode === "number" ? data.exitCode : data.ok ? 0 : 1;
          if (outText) {
            outText.split("\n").forEach((l: string, i: number) => {
              newLines.push({ id: `o${ts}-${i}`, kind: "stdout" as const, text: l, ts });
            });
          }
          if (errText) {
            errText.split("\n").forEach((l: string, i: number) => {
              newLines.push({ id: `e${ts}-${i}`, kind: "stderr" as const, text: l, ts });
            });
          }
          newLines.push({
            id: `m${ts}`,
            kind: "meta" as const,
            text: `[exit ${exitCode}] · ${data.durationMs}ms`,
            ts,
            exit: exitCode,
          });

          // Friendly follow-up hints for the failure modes users actually hit.
          // These are appended AFTER the raw error so the real output stays
          // first — they translate server-side problems into next actions.
          const hints: string[] = [];
          const missingModule = errText.match(
            /ModuleNotFoundError:\s*No module named ['"]([^'"]+)['"]/,
          );
          if (missingModule) {
            hints.push(
              `python module "${missingModule[1]}" is not installed on the runner. Pre-bundled: numpy, pandas, sympy, matplotlib, requests, bs4, pillow — anything else needs the relay owner to add it.`,
            );
          }
          if (
            exitCode === 133 ||
            /Failed to reserve virtual memory|Fatal process OOM/.test(errText)
          ) {
            hints.push(
              "the sandbox hit a runner memory limit for this language — JavaScript/Go runs come back after the room owner redeploys the relay (one command, see relay/README.md).",
            );
          } else if (/failed to reserve page summary memory/.test(errText)) {
            hints.push(
              "the Go runtime hit a sandbox memory limit — works again after the room owner redeploys the relay (see relay/README.md).",
            );
          }
          if (
            hints.length === 0 &&
            exitCode !== 0 &&
            !outText.trim() &&
            !s.stdin.trim() &&
            ["python", "c", "cpp", "java", "javascript", "bash", "go", "rust"].includes(
              String(sendLang).toLowerCase(),
            )
          ) {
            hints.push(
              "no output — if your program reads input (input(), scanf, cin, Scanner), type the values in the input box below and run again.",
            );
          }
          hints.forEach((h, i) => {
            newLines.push({ id: `h${ts}-${i}`, kind: "hint" as const, text: h, ts });
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
      setTerminalHeight: (h) => set({ terminalHeight: h }),
      setStdinOpen: (v) => set({ stdinOpen: v }),
      setStdin: (s2) => set({ stdin: s2 }),

      // ---------- real document history ----------
      /**
       * Record a snapshot of the active file's real content. Called by the
       * session whenever text changes (local or remote). Throttled: a new
       * snapshot is kept only if ≥ 12 s passed OR the content changed by
       * ≥ 200 chars since the last one. Capped at 60 entries per room.
       */
      recordHistory: (meta) => {
        const s = get();
        const file = s.files.find((f) => f.id === s.activeFileId) || s.files[0];
        if (!file) return;
        const last = s.docHistory[s.docHistory.length - 1];
        if (last && last.fileId === file.id) {
          if (last.content === file.content) return;
          const changed = Math.abs(last.content.length - file.content.length) +
            (last.content === file.content ? 0 : 1);
          const timeOk = Date.now() - last.ts >= 12_000;
          const sizeOk = changed >= 200 || file.content.length - last.content.length >= 200;
          if (!timeOk && !sizeOk) return;
        }
        const entry: HistoryEntry = {
          id: "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          fileId: file.id,
          fileName: file.name,
          ts: Date.now(),
          content: file.content,
          author: meta.author,
          color: meta.color,
          authorId: meta.authorId,
        };
        set((st) => ({
          docHistory: [...st.docHistory, entry].slice(-60),
          undoDepth: 0,
        }));
      },

      /** Step back / forward through real recorded snapshots (undo/redo). */
      undoEdit: () => {
        const s = get();
        const hist = s.docHistory;
        if (hist.length < 2) return;
        const nextDepth = Math.min(s.undoDepth + 1, hist.length - 1);
        const target = hist[hist.length - 1 - nextDepth];
        const file = s.files.find((f) => f.id === target.fileId);
        if (!file) return;
        s.updateFileContent(file.id, target.content);
        set({ undoDepth: nextDepth });
      },
      redoEdit: () => {
        const s = get();
        if (s.undoDepth <= 0) return;
        const nextDepth = s.undoDepth - 1;
        const target = s.docHistory[s.docHistory.length - 1 - nextDepth];
        if (!target) return;
        const file = s.files.find((f) => f.id === target.fileId);
        if (!file) return;
        s.updateFileContent(file.id, target.content);
        set({ undoDepth: nextDepth });
      },

      // ---------- test runner (REAL execution: JS in-browser, Python via sandbox) ----------
      runTests: async () => {
        const s = get();
        if (s.testing) return;
        const file = s.files.find((f) => f.id === s.activeFileId);
        if (!file) return;
        set({ testing: true, testPanelOpen: true });
        const startTs = Date.now();
        try {
          const lang = (file.language || "javascript").toLowerCase();
          if (lang !== "javascript" && lang !== "js" && lang !== "python" && lang !== "py") {
            const result: TestRunResult = {
              suites: [],
              total: 0, passed: 0, failed: 0, skipped: 0,
              durationMs: Date.now() - startTs,
              ranAt: startTs,
            };
            set({ testResult: result, testing: false });
            get().pushNotification({
              kind: "info",
              title: "Test runner unavailable for " + lang,
              body: "Real test execution currently supports JavaScript and Python files.",
            });
            return;
          }

          // JavaScript: execute FOR REAL in this browser tab (src/lib/test-runner
          // — describe/test/it/expect actually run; pass/fail, durations,
          // assertion counts and console output are measured, not simulated).
          // No server round-trip: tests keep working even when the sandbox
          // runner is unreachable.
          if (lang === "javascript" || lang === "js") {
            const harness = await runJsTests(file.content);
            const suites: TestSuite[] = harness.suites.map((su, i) => ({
              id: `suite${i}`,
              name: su.name,
              cases: su.cases.map((tc, j) => ({
                id: `case${i}-${j}`,
                name: tc.name,
                status: tc.status,
                durationMs: tc.durationMs,
                error: tc.error,
                assertions: tc.assertions,
              })),
            }));
            if (harness.rootError) {
              suites.unshift({
                id: "suite-root",
                name: "runtime",
                cases: [{
                  id: "case-root",
                  name: "loading the file",
                  status: "fail" as const,
                  error: harness.rootError,
                  assertions: 0,
                }],
              });
            }
            const passed = suites.reduce((acc, su) => acc + su.cases.filter((c) => c.status === "pass").length, 0);
            const failed = suites.reduce((acc, su) => acc + su.cases.filter((c) => c.status === "fail").length, 0);
            const total = suites.reduce((acc, su) => acc + su.cases.length, 0);
            const result: TestRunResult = {
              suites,
              total,
              passed,
              failed,
              skipped: total - passed - failed,
              durationMs: Date.now() - startTs,
              ranAt: startTs,
            };
            set({ testResult: result, testing: false, testExpanded: {} });
            if (total === 0) {
              get().pushNotification({
                kind: "info",
                title: "No tests found",
                body: "Wrap code in describe(\"…\", () => { test(\"…\", () => { … }) }) to make it discoverable.",
              });
            } else if (failed > 0) {
              get().pushNotification({ kind: "warning", title: failed + " test" + (failed > 1 ? "s" : "") + " failed", body: "See the test panel for assertion errors." });
            } else {
              get().pushNotification({ kind: "info", title: "All " + total + " tests passed", body: "in " + result.durationMs + "ms · real in-browser execution" });
            }
            return;
          }

          // Python: build a real harness and execute it in the sandbox runner;
          // results are reported on stdout as JSON.
          const wrapped = buildTestHarness(file.content, lang);
          const res = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              language: lang.startsWith("py") ? "python" : "javascript",
              source: wrapped,
            }),
          });
          const data = await res.json();
          const stdout: string = data.stdout || "";
          const marker = stdout.indexOf("__ANON_RESULTS__");
          if (marker === -1) {
            // The file crashed before reporting — surface the real error.
            const stderr: string = data.stderr || "";
            const result: TestRunResult = {
              suites: [{
                id: "suite0",
                name: "runtime",
                cases: [{
                  id: "case0",
                  name: "harness",
                  status: "fail",
                  error: (stderr || stdout || "no output").split("\n").slice(0, 6).join("\n").slice(0, 400),
                  assertions: 0,
                }],
              }],
              total: 1, passed: 0, failed: 1, skipped: 0,
              durationMs: Date.now() - startTs,
              ranAt: startTs,
            };
            set({ testResult: result, testing: false });
            get().pushNotification({ kind: "warning", title: "Test run crashed", body: "See the test panel for the error." });
            return;
          }

          const json = stdout.slice(marker + "__ANON_RESULTS__".length).split("\n")[0];
          const raw = JSON.parse(json) as {
            suites: { name: string; cases: { name: string; status: string; assertions: number; error: string | null; durationMs: number }[] }[];
          };
          const suites: TestSuite[] = raw.suites.map((su, i) => ({
            id: `suite${i}`,
            name: su.name,
            cases: su.cases.map((tc, j) => ({
              id: `case${i}-${j}`,
              name: tc.name,
              status: (tc.status === "pass" ? "pass" : tc.status === "fail" ? "fail" : "skip") as "pass" | "fail" | "skip",
              durationMs: tc.durationMs,
              error: tc.error ?? undefined,
              assertions: tc.assertions,
            })),
          }));
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
          if (total === 0) {
            get().pushNotification({
              kind: "info",
              title: "No tests found",
              body: "Wrap code in describe(\"…\", () => { test(\"…\", () => { … }) }) to make it discoverable.",
            });
          } else if (failed > 0) {
            get().pushNotification({
              kind: "warning",
              title: `${failed} test${failed > 1 ? "s" : ""} failed`,
              body: `${passed} passed, ${failed} failed in ${file.name} (real sandbox execution)`,
            });
          }
        } catch (e) {
          set({ testing: false });
          get().pushNotification({
            kind: "warning",
            title: "Test run failed to reach the runner",
            body: e instanceof Error ? e.message : String(e),
          });
        }
      },
      clearTests: () => set({ testResult: null, testExpanded: {} }),
      toggleTestExpanded: (suiteId) =>
        set((s) => ({
          testExpanded: { ...s.testExpanded, [suiteId]: !s.testExpanded[suiteId] },
        })),

      // ---------- named snapshots (bookmark a REAL history entry) ----------
      addSnapshot: (label) => {
        const s = get();
        if (!label.trim()) return;
        const file = s.files.find((f) => f.id === s.activeFileId) || s.files[0];
        if (!file) return;
        // Snapshot the file's current REAL content as a named history entry.
        const entry: HistoryEntry = {
          id: "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          fileId: file.id,
          fileName: file.name,
          ts: Date.now(),
          content: file.content,
          author: s.displayName || "you",
          color: s.color,
          authorId: "me",
          label: label.trim(),
        };
        const snap: NamedSnapshot = {
          id: "snap" + Date.now(),
          label: label.trim(),
          historyId: entry.id,
          author: entry.author,
          color: entry.color,
          ts: entry.ts,
        };
        set((st) => ({
          snapshots: [snap, ...st.snapshots],
          docHistory: [...st.docHistory, entry].slice(-60),
          undoDepth: 0,
          newSnapLabel: "",
        }));
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
            const isAi = typeof data.model === "string" && !data.model.includes("template");
            const gen: GeneratedUi = {
              id: "gen" + Date.now(),
              prompt,
              html: data.html,
              ts: Date.now(),
              source: isAi ? "ai" : "template",
              model: data.model,
            };
            set({ generatedUis: [gen, ...s.generatedUis], generating: false });
          } else {
            set({ generating: false });
            get().pushNotification({
              kind: "warning",
              title: "Generation failed",
              body: data.error || "unknown error",
            });
          }
        } catch (e) {
          set({ generating: false });
          get().pushNotification({
            kind: "warning",
            title: "Generation failed",
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
        // client-side WebCrypto fallback — same salts as the relay protocol
        // (src/lib/relay.ts); demo-speed 100k iterations like /api/crypto.
        try {
          const enc = new TextEncoder();
          const input = `${code}:${s.cryptoPassword || ""}`;
          const keySalt = `textshare|${code}`;
          const authSalt = `textshare-auth|${code}`;
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
      setGoal: (text) => {
        if (sessionActive()) {
          sessionSetGoal(text);
          return;
        }
        set((s) => ({
          goalText: text.trim(),
          goalAuthor: s.displayName || "you",
          goalColor: s.color,
          goalSetAt: Date.now(),
        }));
      },
      clearGoal: () => {
        if (sessionActive()) {
          sessionSetGoal("");
          return;
        }
        set({ goalText: "", goalAuthor: "", goalColor: "", goalSetAt: null });
      },

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
