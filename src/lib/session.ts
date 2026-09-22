/**
 * Active room session — bridges the Yjs document + relay client into the
 * zustand UI store. Owns the real E2EE lifecycle:
 *
 *   files      → Y.Array  [{ id, name, language }]
 *   texts      → Y.Map    id → Y.Text
 *   chat       → Y.Array  [{ author, name, color, text, ts, codeBlock? }]
 *   shared     → Y.Array  encrypted file metadata (chunks live on the relay)
 *   meta       → Y.Map    { goal?, goalAuthor?, goalColor?, goalSetAt? }
 *   awareness  → { user: { name, color, own, cursorLine, typing, typingAt, typingIn }, act }
 *
 * All document traffic is AES-GCM sealed with the room key; the relay only
 * ever relays/stores ciphertext.
 */

import * as Y from "yjs";
import { RelayClient, relayHost, type RoomStateFrame, type ConnState } from "./relay";
import { useAnon } from "./store";
import type { EditorFile, ChatMessage, Participant, SharedFile } from "./store";

export interface SessionInfo {
  code: string;
  host: string;
  owner: boolean;
  created: boolean;
  hasPassword: boolean;
  startedAt: number;
}

interface YChatEntry {
  author: string;
  name: string;
  color: string;
  text: string;
  ts: number;
  codeBlock?: { lang: string; src: string } | null;
}

interface YFileMeta {
  id: string;
  name: string;
  language: string;
}

export interface YSharedMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  totalChunks: number;
  sha256: string;
  uploadedAt: number;
  uploader: string;
  uploaderColor: string;
}

const CHUNK_SIZE = 64 * 1024;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const CHAT_KEEP = 200;

let active: {
  info: SessionInfo;
  doc: Y.Doc;
  relay: RelayClient;
  teardown: () => void;
} | null = null;

export function getSession() {
  return active;
}

export function sessionCode(): string | null {
  return active?.info.code ?? null;
}

/**
 * Owner-only room administration routed to whichever relay the live
 * socket is using (primary or fallback). Returns ok:false with an error
 * code when there is no session, no owner token, or the relay refused.
 */
export async function adminRoom(
  action: "delete" | "suspend" | "lock" | "ttl",
  value?: unknown,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const s = active;
  if (!s) return { ok: false, error: "no_session" };
  return s.relay.adminRoom(action, value);
}

/* ----------------------------------------------------------- text diffing */

/** Apply newContent onto a Y.Text with a minimal splice (CRDT-friendly). */
function applyMinimalDiff(ytext: Y.Text, newContent: string): void {
  const old = ytext.toString();
  if (old === newContent) return;
  let start = 0;
  const oldLen = old.length;
  const newLen = newContent.length;
  const maxStart = Math.min(oldLen, newLen);
  while (start < maxStart && old[start] === newContent[start]) start++;
  let endOld = oldLen;
  let endNew = newLen;
  while (endOld > start && endNew > start && old[endOld - 1] === newContent[endNew - 1]) {
    endOld--;
    endNew--;
  }
  ytext.delete(start, endOld - start);
  if (endNew > start) ytext.insert(start, newContent.slice(start, endNew));
}

/* ------------------------------------------------------- file encryption */

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function encryptChunk(key: CryptoKey, arrayBuffer: ArrayBuffer): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, arrayBuffer));
  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv);
  combined.set(encrypted, 12);
  return combined;
}

async function decryptChunk(key: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.byteLength < 29) throw new Error("Encrypted chunk is invalid");
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12)));
}

function retryDelay(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers?.get?.("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 10000);
  }
  return Math.min(300 * 2 ** attempt + Math.random() * 150, 5000);
}

async function fetchWithRetry(url: string, init: RequestInit, maxRetries = 2): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelay(null, attempt)));
      continue;
    }
    if (response.ok) return response;
    let detail = "";
    try { detail = ((await response.clone().json()) as { error?: string }).error || ""; } catch { /* ignore */ }
    if (response.status === 404 && detail === "no_room") throw new Error("Room does not exist or has expired on the relay");
    if (response.status === 403) throw new Error("Unauthorized room access");
    const error = new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    const retryable = [429, 502, 503, 504].includes(response.status);
    if (!retryable || attempt === maxRetries) throw error;
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
  }
  throw lastError instanceof Error ? lastError : new Error("Network request failed");
}

/* ------------------------------------------------------------ lifecycle */

export interface StartSessionArgs {
  code: string;
  host?: string;
  keys: { key: CryptoKey; auth: string };
  owner: string | null;
  created: boolean;
  hasPassword: boolean;
  displayName: string;
  color: string;
}

export function startSession(args: StartSessionArgs): SessionInfo {
  endSession();

  const host = args.host || relayHost();
  const doc = new Y.Doc();
  const files = doc.getArray<YFileMeta>("files");
  const texts = doc.getMap<Y.Text>("texts");
  const chat = doc.getArray<YChatEntry>("chat");
  const shared = doc.getArray<YSharedMeta>("shared_files");
  const meta = doc.getMap("meta");

  // Seed the default file only for freshly created rooms so every joiner
  // receives it through the normal (encrypted) sync path.
  if (args.created && files.length === 0) {
    doc.transact(() => {
      files.push([{ id: "f1", name: "main.js", language: "javascript" }]);
      texts.set("f1", new Y.Text("// End-to-end encrypted collaborative session\n// Share your room code to invite collaborators in real-time.\n"));
    });
  }

  const store = useAnon.getState();

  const relay = new RelayClient(host, args.code, doc, args.keys.key, args.keys.auth, args.owner, {
    onConn: (state: ConnState) => {
      useAnon.setState({ syncState: state });
    },
    onRoom: (frame: RoomStateFrame) => {
      useAnon.setState({
        roomState: frame,
        canEdit: frame.canEdit,
      });
    },
    onKilled: (reason) => {
      const message =
        reason === "deleted" ? "This room was deleted by its owner." :
        reason === "admin_deleted" ? "This room was deleted by the server operator." :
        reason === "suspended" || reason === "admin_suspended" ? "This room was suspended." :
        `Room closed (${reason}).`;
      useAnon.getState().exitRoom();
      import("sonner").then(({ toast }) => toast.error(message, { duration: 8000 }));
    },
    onError: (reason) => {
      if (reason === "read_only") {
        import("sonner").then(({ toast }) => toast("This room is read-only — the owner locked it"));
      } else if (reason === "room_full_bytes") {
        import("sonner").then(({ toast }) => toast.error("This room hit its size limit"));
      }
    },
  });

  // Awareness: presence, cursors, typing.
  relay.awareness.setLocalStateField("user", {
    name: args.displayName || "you",
    color: args.color,
    own: !!args.owner,
    cursorLine: 1,
    typing: false,
    typingAt: 0,
    typingIn: "editor",
  });
  relay.awareness.setLocalStateField("act", Date.now());

  /* ---------------- store mirrors (Yjs is the source of truth) ------------- */

  const mirrorFiles = () => {
    const list = files.toArray();
    const mirrored: EditorFile[] = list.map((f) => ({
      id: f.id,
      name: f.name,
      language: f.language,
      content: texts.get(f.id)?.toString() ?? "",
    }));
    const state = useAnon.getState();
    const activeId = list.some((f) => f.id === state.activeFileId) ? state.activeFileId : list[0]?.id || "f1";
    useAnon.setState({ files: mirrored, activeFileId: activeId });
  };

  /**
   * Real history tracker: every text mutation (local OR remote) is offered to
   * the store, which throttles + caps snapshots. Author attribution uses the
   * awareness "act" timestamps — the remote peer active most recently when
   * the change landed, else the local user.
   */
  const trackHistory = () => {
    const now = Date.now();
    let author = args.displayName || "you";
    let color = args.color;
    let authorId = "me";
    for (const [clientId, st] of relay.awareness.getStates() as Map<number, Record<string, unknown>>) {
      if (clientId === doc.clientID) continue;
      const act = typeof st.act === "number" ? st.act : 0;
      const u = (st.user || {}) as { name?: string; color?: string };
      if (now - act < 6000 && u.name) {
        author = u.name;
        color = u.color || color;
        authorId = String(clientId);
      }
    }
    useAnon.getState().recordHistory({ author, color, authorId });
  };

  let historyDebounce: ReturnType<typeof setTimeout> | null = null;
  const historyHandler = () => {
    if (historyDebounce) return;
    historyDebounce = setTimeout(() => {
      historyDebounce = null;
      trackHistory();
    }, 700);
  };

  const mirrorChat = () => {
    const entries = chat.toArray().slice(-CHAT_KEEP);
    const messages: ChatMessage[] = entries.map((e) => ({
      id: `${e.author}:${e.ts}`,
      authorId: e.author,
      authorName: e.name,
      color: e.color,
      body: e.text,
      ts: e.ts,
      codeBlock: e.codeBlock ?? null,
      pinned: false,
      threadParent: null,
    }));
    useAnon.setState({ messages });
  };

  const mirrorShared = () => {
    const state = useAnon.getState();
    // Keep local dataUrl cache for entries we already downloaded.
    const byId = new Map(state.sharedFiles.map((f) => [f.id, f]));
    const mirrored: SharedFile[] = shared.toArray().map((f) => {
      const cached = byId.get(f.id);
      return cached ?? {
        id: f.id,
        name: f.name,
        size: f.size,
        type: f.type,
        dataUrl: "",
        uploadedAt: f.uploadedAt,
        uploader: f.uploader,
        uploaderColor: f.uploaderColor,
      };
    });
    useAnon.setState({ sharedFiles: mirrored });
  };

  const mirrorParticipants = () => {
    const states = relay.awareness.getStates() as Map<number, Record<string, unknown>>;
    const now = Date.now();
    const me = {
      id: "me",
      name: args.displayName || "You",
      color: args.color,
      isOwner: !!args.owner,
      online: true,
      cursorLine: 1,
      typing: false,
    };
    const others: Participant[] = [];
    for (const [clientId, state] of states) {
      if (clientId === doc.clientID) {
        const u = state.user as { cursorLine?: number; typing?: boolean } | undefined;
        me.cursorLine = u?.cursorLine ?? 1;
        me.typing = !!u?.typing;
        continue;
      }
      const u = state.user as
        | { name?: string; color?: string; own?: boolean; cursorLine?: number; typing?: boolean; typingAt?: number; typingIn?: string }
        | undefined;
      if (!u) continue;
      // Stale guard: peers that crashed without clearing their typing flag
      // stop showing as "typing…" after 5 seconds of silence.
      const freshTyping = !!u.typing && typeof u.typingAt === "number" && now - u.typingAt < 5000;
      others.push({
        id: String(clientId),
        name: u.name || "anon",
        color: u.color || "#6d6d6d",
        isOwner: !!u.own,
        cursorLine: u.cursorLine,
        typing: freshTyping,
        typingIn: freshTyping ? u.typingIn || "editor" : undefined,
        online: true,
      });
    }
    useAnon.setState({ participants: [me, ...others] });
  };

  files.observeDeep(() => mirrorFiles());
  // NOTE: Y.Map#observe only fires for set/delete of keys — NOT for mutations
  // inside the Y.Text values. observeDeep is required so local AND remote
  // text edits re-run the store mirror (otherwise controlled textareas bounce
  // back to stale content).
  texts.observeDeep(() => {
    mirrorFiles();
    historyHandler();
  });
  chat.observe(() => mirrorChat());
  shared.observe(() => mirrorShared());
  meta.observe(() => {
    const m = meta.toJSON() as Record<string, unknown>;
    useAnon.setState({
      goalText: (m.goalText as string) || "",
      goalAuthor: (m.goalAuthor as string) || "",
      goalColor: (m.goalColor as string) || "",
      goalSetAt: (m.goalSetAt as number) || null,
    });
  });
  relay.awareness.on("update", () => mirrorParticipants());

  const initialSyncTimeout = setTimeout(() => {
    // After the first sync window, mirror whatever arrived.
    mirrorFiles();
    mirrorChat();
    mirrorShared();
    mirrorParticipants();
  }, 400);

  const teardown = () => {
    clearTimeout(initialSyncTimeout);
    if (historyDebounce) clearTimeout(historyDebounce);
    try { relay.awareness.off("update", mirrorParticipants); } catch { /* ignore */ }
    relay.close();
    active = null;
    useAnon.setState({ syncState: "dead", roomState: null });
  };

  const info: SessionInfo = {
    code: args.code,
    host,
    owner: !!args.owner,
    created: args.created,
    hasPassword: args.hasPassword,
    startedAt: Date.now(),
  };

  active = { info, doc, relay, teardown };
  void store; // store referenced for initial state snapshot timing
  return info;
}

export function endSession(): void {
  if (active) active.teardown();
}

/* ------------------------------------------------------------ mutations */

export function pushChat(body: string, codeBlock?: { lang: string; src: string } | null): void {
  if (!active) return;
  const s = useAnon.getState();
  const chat = active.doc.getArray<YChatEntry>("chat");
  chat.push([{
    author: String(active.doc.clientID),
    name: s.displayName || "you",
    color: s.color,
    text: body.slice(0, 500),
    ts: Date.now(),
    codeBlock: codeBlock ?? null,
  }]);
  // Keep the relay log bounded: trim the chat array when it grows too long.
  if (chat.length > CHAT_KEEP + 50) {
    chat.delete(0, chat.length - CHAT_KEEP);
  }
}

export function sendCursor(line: number): void {
  if (!active) return;
  const user = (active.relay.awareness.getLocalState()?.user || {}) as { name?: string; color?: string; own?: boolean; cursorLine?: number };
  active.relay.awareness.setLocalStateField("user", { ...user, cursorLine: line });
  active.relay.awareness.setLocalStateField("act", Date.now());
}

/* ------------------------------------------------------ typing indicator */

let typingTimer: ReturnType<typeof setTimeout> | null = null;
let typingThrottle = 0;

/**
 * Broadcast "I am typing" to the room over the encrypted awareness channel.
 * Auto-clears after 1.6 s of inactivity; refreshes at most every 300 ms so
 * fast typers don't flood the relay.
 */
export function setTyping(where: "editor" | "chat"): void {
  if (!active) return;
  const now = Date.now();
  if (now - typingThrottle < 300) {
    // still reset the auto-clear window on every keystroke
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => setTypingOff(), 1600);
    return;
  }
  typingThrottle = now;
  const user = (active.relay.awareness.getLocalState()?.user || {}) as Record<string, unknown>;
  active.relay.awareness.setLocalStateField("user", { ...user, typing: true, typingAt: Date.now(), typingIn: where });
  active.relay.awareness.setLocalStateField("act", Date.now());
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => setTypingOff(), 1600);
}

function setTypingOff(): void {
  if (typingTimer) { clearTimeout(typingTimer); typingTimer = null; }
  if (!active) return;
  const user = (active.relay.awareness.getLocalState()?.user || {}) as Record<string, unknown>;
  active.relay.awareness.setLocalStateField("user", { ...user, typing: false, typingAt: Date.now() });
}

/** Update a file's content in the Yjs doc (minimal diff → CRDT merge). */
export function updateFileText(fileId: string, content: string): void {
  if (!active) return;
  const texts = active.doc.getMap<Y.Text>("texts");
  const existing = texts.get(fileId);
  if (existing) {
    applyMinimalDiff(existing, content);
    return;
  }
  // New file content for an id that has no text yet.
  active.doc.transact(() => {
    const files = active!.doc.getArray<YFileMeta>("files");
    if (!files.toArray().some((f) => f.id === fileId)) {
      files.push([{ id: fileId, name: fileId, language: "javascript" }]);
    }
    texts.set(fileId, new Y.Text(content));
  });
}

export function addYFile(name: string, language: string, content = ""): string {
  if (!active) return "";
  const files = active.doc.getArray<YFileMeta>("files");
  let id = "f" + (files.length + 1);
  while (files.toArray().some((f) => f.id === id)) id = "f" + Math.random().toString(36).slice(2, 6);
  active.doc.transact(() => {
    files.push([{ id, name, language }]);
    if (content) active!.doc.getMap<Y.Text>("texts").set(id, new Y.Text(content));
    else active!.doc.getMap<Y.Text>("texts").set(id, new Y.Text());
  });
  return id;
}

export function removeYFile(fileId: string): void {
  if (!active) return;
  const files = active.doc.getArray<YFileMeta>("files");
  const idx = files.toArray().findIndex((f) => f.id === fileId);
  active.doc.transact(() => {
    if (idx >= 0) files.delete(idx, 1);
    active!.doc.getMap<Y.Text>("texts").delete(fileId);
  });
}

export function setGoal(text: string): void {
  if (!active) return;
  const s = useAnon.getState();
  const meta = active.doc.getMap("meta");
  if (!text.trim()) {
    meta.delete("goalText");
    meta.delete("goalAuthor");
    meta.delete("goalColor");
    meta.delete("goalSetAt");
    return;
  }
  meta.set("goalText", text.trim());
  meta.set("goalAuthor", s.displayName || "you");
  meta.set("goalColor", s.color);
  meta.set("goalSetAt", Date.now());
}

export function grantEditTo(cid: string): void {
  active?.relay.grantEdit(cid);
}

/* ------------------------------------------------- encrypted file upload */

export async function uploadSharedFile(
  file: globalThis.File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  if (!active) throw new Error("No active room");
  if (file.size > MAX_FILE_SIZE) throw new Error(`File exceeds the 25 MB limit (${(file.size / 1048576).toFixed(1)} MB)`);
  const { code, host } = active.info;
  const key = active.relay.key;
  const auth = active.relay.auth;

  const fileId = `att_${Date.now().toString(36)}_${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const fileHash = await sha256Hex(await file.arrayBuffer());
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http:" : "https:";
  const baseUrl = `${proto}//${host}/room/${encodeURIComponent(code)}/files/${encodeURIComponent(fileId)}`;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const encrypted = await encryptChunk(key, await file.slice(start, end).arrayBuffer());
    try {
      await fetchWithRetry(`${baseUrl}/chunk/${i}?a=${encodeURIComponent(auth)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-room-auth": auth,
          Authorization: `Bearer ${auth}`,
        },
        body: encrypted as unknown as BodyInit,
      });
    } catch (error) {
      throw new Error(`Upload failed at chunk ${i + 1}/${totalChunks} (${(error as Error).message})`);
    }
    onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
  }

  const s = useAnon.getState();
  const shared = active.doc.getArray<YSharedMeta>("shared_files");
  shared.push([{
    id: fileId,
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    totalChunks,
    sha256: fileHash,
    uploadedAt: Date.now(),
    uploader: s.displayName || "you",
    uploaderColor: s.color,
  }]);
}

export async function downloadSharedFile(fileId: string): Promise<Blob> {
  if (!active) throw new Error("No active room");
  const shared = active.doc.getArray<YSharedMeta>("shared_files");
  const fileMeta = shared.toArray().find((f) => f.id === fileId);
  if (!fileMeta) throw new Error("File metadata not found");
  if (!Number.isSafeInteger(fileMeta.totalChunks) || fileMeta.totalChunks < 0) {
    throw new Error("Invalid file metadata");
  }
  const { code, host } = active.info;
  const key = active.relay.key;
  const auth = active.relay.auth;
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http:" : "https:";
  const baseUrl = `${proto}//${host}/room/${encodeURIComponent(code)}/files/${encodeURIComponent(fileId)}`;

  const chunks: Uint8Array[] = [];
  for (let i = 0; i < fileMeta.totalChunks; i++) {
    const response = await fetchWithRetry(`${baseUrl}/chunk/${i}?a=${encodeURIComponent(auth)}`, {
      method: "GET",
      headers: { "x-room-auth": auth, Authorization: `Bearer ${auth}` },
    });
    chunks.push(await decryptChunk(key, new Uint8Array(await response.arrayBuffer())));
  }
  return new Blob(chunks as BlobPart[], { type: fileMeta.type });
}

export async function deleteSharedFile(fileId: string): Promise<void> {
  if (!active) return;
  const { code, host } = active.info;
  const auth = active.relay.auth;
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http:" : "https:";
  const base = `${proto}//${host}/room/${encodeURIComponent(code)}/files/${encodeURIComponent(fileId)}`;
  const headers = { "x-room-auth": auth, Authorization: `Bearer ${auth}` };
  try {
    // Current relay: DELETE /files/:fileId removes every chunk of the file.
    await fetchWithRetry(`${base}?a=${encodeURIComponent(auth)}`, { method: "DELETE", headers });
  } catch {
    // Older relay generation: the chunk-less route 404s, but DELETE on any
    // chunk index routes and removes the entire file there. Best-effort —
    // the metadata removal below is what peers actually see.
    try {
      await fetchWithRetry(`${base}/chunk/0?a=${encodeURIComponent(auth)}`, { method: "DELETE", headers });
    } catch { /* server-side bytes are purged at room expiry anyway */ }
  }
  const shared = active.doc.getArray<YSharedMeta>("shared_files");
  const idx = shared.toArray().findIndex((f) => f.id === fileId);
  if (idx >= 0) shared.delete(idx, 1);
}

export const FILE_LIMITS = { CHUNK_SIZE, MAX_FILE_SIZE };
