/**
 * anonshare relay client — speaks the production binary WebSocket protocol
 * (relay.avishkark.in / textshare-sync.avishkarkedar.workers.dev).
 *
 * Wire protocol (first byte = frame type, rest = payload):
 *   T_UPDATE  0  document delta  (persisted & rebroadcast, AES-GCM sealed)
 *   T_AWARE   1  presence/cursor (rebroadcast only, sealed)
 *   T_SNAPSHOT 2 compacted state (replaces relay log when invited)
 *   T_SYNCED  3  backlog replay finished
 *   T_ERROR   4  error message (text)
 *   T_COMPACT 5  relay invites this cid to send a snapshot
 *   T_STATE   6  room state (JSON text: peers, ttl, canEdit, suspended…)
 *   T_KILLED  7  room closed / deleted / suspended (text reason)
 *   T_GRANT   8  owner grants edit rights to a cid
 *
 * Room lifecycle (HTTP):
 *   create: POST /room/:code?create=1&excl=1&a=<auth>&o=<owner>&ttl=<ttl>&p=<0|1>
 *   join:   GET  /room/:code?a=<auth>[&o=<owner>]  → 426 expected_websocket
 *   exists: GET  /room/:code/exists
 *
 * Crypto (zero-knowledge to the relay):
 *   key  = PBKDF2-SHA256(code:password, salt "textshare|<code>",  600k) → AES-GCM-256
 *   auth = PBKDF2-SHA256(code:password, salt "textshare-auth|<code>", 600k) → 256-bit token
 *   The relay only ever stores sha256(auth); documents are sealed with key.
 */

import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness.js";

export const T_UPDATE = 0;
export const T_AWARE = 1;
export const T_SNAPSHOT = 2;
export const T_SYNCED = 3;
export const T_ERROR = 4;
export const T_COMPACT = 5;
export const T_STATE = 6;
export const T_KILLED = 7;
export const T_GRANT = 8;

export const PBKDF2_ROUNDS = 600_000;
export const SALT_KEY = "textshare";
export const SALT_AUTH = "textshare-auth";
export const TTLS = ["10m", "1h", "24h"] as const;

export const DEFAULT_RELAY = "relay.avishkark.in";
export const FALLBACK_RELAY = "textshare-sync.avishkarkedar.workers.dev";

const TE = new TextEncoder();
const TD = new TextDecoder();

/* ------------------------------------------------------------- helpers */

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 ? "=".repeat(4 - (norm.length % 4)) : "";
  const bin = atob(norm + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Random 32-byte url-safe token (used for owner tokens / client ids). */
export function randToken(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function newRoomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/* --------------------------------------------------------------- crypto */

export interface RoomKeys {
  key: CryptoKey;      // AES-GCM-256 — never leaves the browser
  auth: string;        // relay auth token (relay stores only sha256 of it)
}

export async function deriveRoomKeys(code: string, password: string): Promise<RoomKeys> {
  const base = await crypto.subtle.importKey(
    "raw", TE.encode(code + ":" + (password || "")), "PBKDF2", false, ["deriveKey", "deriveBits"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: TE.encode(`${SALT_KEY}|${code}`), iterations: PBKDF2_ROUNDS, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: TE.encode(`${SALT_AUTH}|${code}`), iterations: PBKDF2_ROUNDS, hash: "SHA-256" },
    base, 256);
  return { key, auth: b64url(new Uint8Array(bits)) };
}

async function seal(key: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, bytes as unknown as BufferSource));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

async function unseal(key: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length < 29) throw new Error("sealed payload too short");
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource }, key, ct as unknown as BufferSource));
}

/* ------------------------------------------------------------------ http */

async function http(host: string, path: string, init?: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http:" : "https:";
    return await fetch(`${proto}//${host}${path}`, { cache: "no-store", ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface RoomExistsInfo {
  exists: boolean;
  peers: number;
  hasPassword: boolean;
  auth: boolean;
  suspended: boolean;
  locked: boolean;
}

export async function roomInfo(host: string, code: string): Promise<RoomExistsInfo | null> {
  const res = await http(host, `/room/${encodeURIComponent(code)}/exists`);
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as RoomExistsInfo;
  } catch {
    return null;
  }
}

/* ------------------------------------------------- create / join outcome */

export type RoomResult =
  | { ok: true; code: string; host: string; keys: RoomKeys; owner: string; created: boolean }
  | { ok: false; reason: "network" | "busy" | "collision" | "password" | "gone" | "suspended" | "relay" | "bad" ; status?: number; detail?: string };

/**
 * Create a new room on the relay. Retries on code collisions (409).
 * The owner token is random, persisted by the caller (localStorage),
 * and never shared with peers.
 */
export async function createRoom(
  host: string,
  opts: { password?: string; ttl?: string; code?: string },
): Promise<RoomResult> {
  const owner = randToken();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = attempt === 0 && opts.code ? opts.code.toUpperCase() : newRoomCode();
    const keys = await deriveRoomKeys(code, opts.password || "");
    const p = new URLSearchParams({
      create: "1", excl: "1", a: keys.auth, o: owner,
      ttl: TTLS.includes((opts.ttl || "1h") as (typeof TTLS)[number]) ? (opts.ttl || "1h") : "1h",
    });
    if (opts.password) p.set("p", "1");

    const res = await http(host, `/room/${code}?${p.toString()}`, { method: "POST" });
    if (!res) return { ok: false, reason: "network" };
    if (res.status === 409) continue; // code taken — try another
    if (res.status === 429) return { ok: false, reason: "busy" };
    if (res.status !== 426) {
      let detail = "";
      try { detail = ((await res.json()) as { error?: string }).error || ""; } catch { /* ignore */ }
      return { ok: false, reason: "relay", status: res.status, detail };
    }
    return { ok: true, code, host, keys, owner, created: true };
  }
  return { ok: false, reason: "collision" };
}

/** Join an existing room (verifies the password-derived auth token). */
export async function joinRoom(
  host: string,
  code: string,
  password: string,
  ownerToken: string | null,
): Promise<RoomResult> {
  const keys = await deriveRoomKeys(code, password);
  const p = new URLSearchParams({ a: keys.auth });
  if (ownerToken) p.set("o", ownerToken);

  const res = await http(host, `/room/${code}?${p.toString()}`);
  if (!res) return { ok: false, reason: "network" };
  if (res.status === 403) return { ok: false, reason: "password" };
  if (res.status === 404) return { ok: false, reason: "gone" };
  if (res.status === 423) return { ok: false, reason: "suspended" };
  if (res.status === 429) return { ok: false, reason: "busy" };
  if (res.status !== 426) {
    let detail = "";
    try { detail = ((await res.json()) as { error?: string }).error || ""; } catch { /* ignore */ }
    return { ok: false, reason: "relay", status: res.status, detail };
  }
  return { ok: true, code: code.toUpperCase(), host, keys, owner: ownerToken || "", created: false };
}

/* --------------------------------------------------------- relay client */

export interface RoomStateFrame {
  suspended: boolean;
  suspendedByAdmin: boolean;
  locked: boolean;
  owner: boolean;
  canEdit: boolean;
  peers: number;
  ttl: number;
}

export type ConnState = "connecting" | "connected" | "synced" | "retrying" | "dead";

export interface RelayEvents {
  onConn?: (state: ConnState) => void;
  onRoom?: (frame: RoomStateFrame) => void;
  onKilled?: (reason: string) => void;
  onPeerCount?: (peers: number) => void;
  onError?: (reason: string) => void;
}

export class RelayClient {
  host: string;
  code: string;
  doc: Y.Doc;
  awareness: Awareness;
  key: CryptoKey;
  auth: string;
  owner: string | null;

  connState: ConnState = "connecting";
  synced = false;
  tries = 0;
  dead = false;
  lastStateAt = 0;

  private ws: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private events: RelayEvents;

  constructor(host: string, code: string, doc: Y.Doc, key: CryptoKey, auth: string, owner: string | null, events: RelayEvents = {}) {
    this.host = host;
    this.code = code;
    this.doc = doc;
    this.awareness = new Awareness(doc);
    this.key = key;
    this.auth = auth;
    this.owner = owner;
    this.events = events;

    doc.on("update", this.handleDocUpdate);
    this.awareness.on("update", this.handleAwarenessUpdate);
    window.addEventListener("beforeunload", this.handleUnload);
    window.addEventListener("pagehide", this.handleUnload);

    this.connect();
  }

  get cid(): string {
    return String(this.doc.clientID);
  }

  private url(): string {
    const p = new URLSearchParams();
    p.set("a", this.auth);
    if (this.owner) p.set("o", this.owner);
    p.set("cid", this.cid);
    const proto = this.host.startsWith("localhost") || this.host.startsWith("127.0.0.1")
      ? "ws:" : "wss:";
    return `${proto}//${this.host}/room/${this.code}?${p.toString()}`;
  }

  connect(): void {
    if (this.dead) return;
    this.setConn("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url());
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      this.tries = 0;
      this.setConn("connected");
      // Send our current doc state (late joiners / room recovery) and presence.
      void this.send(T_UPDATE, Y.encodeStateAsUpdate(this.doc));
      void this.send(T_AWARE, encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === "string") return;
      const buf = new Uint8Array(ev.data);
      if (!buf.length) return;
      const type = buf[0];
      const body = buf.subarray(1);
      void this.handleFrame(type, body);
    };

    ws.onclose = () => {
      this.synced = false;
      if (!this.dead) this.retry();
    };

    ws.onerror = () => {
      try { ws.close(); } catch { /* ignore */ }
    };
  }

  private async handleFrame(type: number, body: Uint8Array): Promise<void> {
    if (type === T_SYNCED) {
      this.synced = true;
      this.setConn("synced");
      return;
    }
    if (type === T_COMPACT) {
      await this.send(T_SNAPSHOT, Y.encodeStateAsUpdate(this.doc));
      return;
    }
    if (type === T_STATE) {
      try {
        const frame = JSON.parse(TD.decode(body)) as RoomStateFrame;
        this.lastStateAt = Date.now();
        this.events.onRoom?.(frame);
        this.events.onPeerCount?.(frame.peers);
      } catch { /* ignore malformed */ }
      return;
    }
    if (type === T_KILLED) {
      this.dead = true;
      this.setConn("dead");
      this.events.onKilled?.(TD.decode(body));
      return;
    }
    if (type === T_ERROR) {
      this.events.onError?.(TD.decode(body));
      return;
    }
    if (type === T_GRANT) {
      // Relay re-announces state after a grant; nothing to do locally.
      return;
    }
    if (type === T_UPDATE || type === T_AWARE) {
      let plain: Uint8Array;
      try {
        plain = await unseal(this.key, body);
      } catch {
        return; // wrong key (e.g. wrong password) — drop silently
      }
      try {
        if (type === T_UPDATE) Y.applyUpdate(this.doc, plain, this);
        else applyAwarenessUpdate(this.awareness, plain, this);
      } catch { /* ignore malformed */ }
    }
  }

  /** Send a sealed (encrypted) frame; T_STATE routing frames stay plain. */
  async send(type: number, payload: Uint8Array): Promise<boolean> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    let body: Uint8Array;
    if (type === T_UPDATE || type === T_AWARE || type === T_SNAPSHOT) {
      try {
        body = await seal(this.key, payload);
      } catch {
        return false;
      }
    } else {
      body = payload;
    }
    const out = new Uint8Array(1 + body.length);
    out[0] = type;
    out.set(body, 1);
    try {
      ws.send(out);
      return true;
    } catch {
      return false;
    }
  }


  /** Owner-only: grant edit rights to a peer cid. */
  grantEdit(targetCid: string): void {
    void this.send(T_GRANT, TE.encode(targetCid));
  }

  private retry(): void {
    if (this.dead) return;
    this.setConn("retrying");
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.tries++;
    if (this.tries >= 3 && this.host === DEFAULT_RELAY && FALLBACK_RELAY) {
      this.host = FALLBACK_RELAY;
      this.tries = 0;
    }
    const delay = Math.min(15000, 600 * Math.pow(1.6, this.tries));
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private setConn(state: ConnState) {
    this.connState = state;
    this.events.onConn?.(state);
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return; // echo of a remote update — don't resend
    void this.send(T_UPDATE, update);
  };

  private handleAwarenessUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
    const mine = added.concat(updated, removed).filter((id) => id === this.doc.clientID);
    if (!mine.length) return;
    void this.send(T_AWARE, encodeAwarenessUpdate(this.awareness, mine));
  };

  private handleUnload = () => {
    try {
      removeAwarenessStates(this.awareness, [this.doc.clientID], "unload");
    } catch { /* ignore */ }
  };

  close(): void {
    this.dead = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    window.removeEventListener("beforeunload", this.handleUnload);
    window.removeEventListener("pagehide", this.handleUnload);
    this.doc.off("update", this.handleDocUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
  }
}

/** Resolve the relay host for the current environment. */
export function relayHost(override?: string): string {
  if (override) return override;
  if (typeof window !== "undefined") {
    const qs = new URLSearchParams(window.location.search);
    const custom = qs.get("relay");
    if (custom) return custom;
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "localhost:8787";
    }
  }
  if (process.env.NEXT_PUBLIC_RELAY_HOST) return process.env.NEXT_PUBLIC_RELAY_HOST;
  return DEFAULT_RELAY;
}

/** Owner-token persistence (never shared, per-room, local only). */
export function storeOwnerToken(code: string, token: string) {
  try { localStorage.setItem(`ts.own.${code}`, token); } catch { /* ignore */ }
}
export function loadOwnerToken(code: string): string | null {
  try { return localStorage.getItem(`ts.own.${code}`) || null; } catch { return null; }
}
export function clearOwnerToken(code: string) {
  try { localStorage.removeItem(`ts.own.${code}`); } catch { /* ignore */ }
}

export { Y, Awareness, encodeAwarenessUpdate, applyAwarenessUpdate };
export { b64urlDecode, b64url };
