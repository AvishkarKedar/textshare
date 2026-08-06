# textshare

Live, end-to-end encrypted text and code sharing. Open the site, create a room, send
someone the 6-character code, and you are both editing the same document - from
anywhere in the world, on any network, with no account and no install.

**Live at [tx.avishkark.in](https://tx.avishkark.in)**

---

## What it does

- **6-character room codes.** `ABC123` is enough for anyone to join. The link works too.
- **Real-time collaborative editing** with live cursors, names, and colours for everyone in the room.
- **End-to-end encrypted.** Your text is sealed in your browser before it leaves. The server
  relays ciphertext it has no key for.
- **Optional room password**, verified without the server ever seeing it.
- **Multiple files per room** with tabs, so you can share a whole snippet set rather than one blob.
- **Real syntax highlighting** for 16 languages, courtesy of CodeMirror 6 - the same editor
  engine behind many online IDEs. Brackets match, code folds, `Ctrl+F` searches.
- **Undo and redo** that respect other people's edits: undo only ever reverses *your* changes.
- **Chat panel** so you can talk about the document without typing into it.
- **Follow mode.** Click someone's avatar and your view tracks their cursor, across files.
- **Works offline.** Install it to your home screen; edits made with no connection merge
  automatically when you come back.
- **Rooms self-destruct** 10 minutes after the last person disconnects. Nothing lingers.
- **View-only links** for sharing something people should read but not change.

---

## How the encryption works

The key is derived in your browser with PBKDF2 (150,000 iterations, SHA-256) from the room
code plus the optional password, and it never leaves the device. Every document update and
every presence message is AES-GCM sealed before it hits the socket.

This has an interesting consequence: **the server cannot merge edits, because it cannot read
them.** So it does not try. It keeps an append-only log of opaque blobs and replays them to
whoever joins next. That works because Yjs updates are a CRDT - commutative and idempotent -
so replaying the log in any order converges to the same document on every client.

Passwords are never sent, not even hashed. When a room is created, the creator stores an
encrypted probe string. A joiner fetches that probe and tries to decrypt it. If it comes back
as the expected value, the password was right. The server just holds a blob it cannot read.

> **One honest caveat:** the offline copy stored in your browser's IndexedDB is plaintext, since
> it has to be readable without the network. Use **Settings -> Delete offline copy** on a shared
> machine.

---

## Architecture

```
  Browser A  <--- AES-GCM ciphertext --->  Cloudflare Worker  <--- ... --->  Browser B
  CodeMirror 6                             Durable Object per room
  Yjs CRDT                                 append-only encrypted log
  IndexedDB (offline)                      alarm-based 10-minute purge
```

| Piece | What it is |
| --- | --- |
| `index.html`, `app.css`, `app.js` | The whole client. Static files, served by Cloudflare Pages. |
| `sw.js`, `manifest.webmanifest` | Service worker and PWA manifest for offline and install. |
| `worker/src/index.js` | The sync relay. One Durable Object per room code. |

An earlier version used peer-to-peer WebRTC. It was dropped: without a TURN server, P2P fails
behind mobile carrier NAT and corporate firewalls, and a pure mesh has no way to answer the
question *"does room ABC123 exist?"* - so typos silently created empty rooms instead of saying
so. The Worker fixes both.

### The relay protocol

Binary frames, one type byte then a sealed payload:

| Byte | Direction | Meaning |
| --- | --- | --- |
| `0` | both | Document update. Broadcast and appended to the log. |
| `1` | both | Presence. Broadcast only, never stored. |
| `2` | client to server | Snapshot. Replaces the entire log. |
| `3` | server to client | Backlog replay finished. |
| `4` | server to client | Error, followed by a reason string. |
| `5` | server to client | Please send a snapshot so the log can be folded down. |

HTTP endpoints:

- `GET /health` - liveness check.
- `GET /room/:code/exists` - does this room exist, how many people are in it, is it locked.
  This is what produces *"No room exists with code ABC123"* instead of silently creating one.
- `GET /room/:code` (WebSocket upgrade) - join. `?create=1` creates.

### Limits

Enforced in the Durable Object: 256 KB per message, 5 MB per room, 30 connections per room,
120 messages per second per connection, and the 10-minute idle purge. The purge timer starts
when the last person disconnects and resets the moment anyone reconnects, so a room does not
vanish while you are sitting there reading it.

---

## Deploying your own

Both halves deploy from this one repository.

**The site (Cloudflare Pages)** - connect the repo, framework preset `None`, build command
empty, output directory `/`. Static files, nothing to build.

**The relay (Cloudflare Workers)** - create a Worker, connect the same repo, and set:

| Setting | Value |
| --- | --- |
| Root directory | `worker` |
| Build command | `npm install` |
| Deploy command | `npx wrangler deploy` |

The root directory matters. Leave it empty and Wrangler runs at the repo root, finds no
`wrangler.toml`, assumes you meant a static site, and tries to upload `node_modules` - which
fails on a 122 MB binary.

Then point the client at your relay: change `DEFAULT_RELAY` at the top of `app.js`. Users can
also override it per visit with `?relay=your-worker.workers.dev`, or in Settings.

> Keep the custom domain on the **Pages** project only. If you attach it to the Worker as well,
> the Worker wins and every visitor gets `{"ok":true,"service":"textshare-sync"}` instead of the app.

Durable Objects with SQLite storage are available on the free plan; the migration in
`worker/wrangler.toml` is already configured for it.

---

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl/Cmd + Z` / `Shift + Ctrl/Cmd + Z` | Undo / redo your own edits |
| `Ctrl/Cmd + F` | Find, with replace |
| `Tab` | Indent, or accept a completion |
| `Ctrl/Cmd + /` | Toggle comment |

## URL options

| URL | Effect |
| --- | --- |
| `#ABC123` | Join room `ABC123` |
| `?view=1#ABC123` | Join read-only |
| `?relay=host` | Use a different sync server |

---

## Built with

[Yjs](https://github.com/yjs/yjs) - [CodeMirror 6](https://codemirror.net/) -
[y-codemirror.next](https://github.com/yjs/y-codemirror.next) -
[Cloudflare Workers + Durable Objects](https://developers.cloudflare.com/durable-objects/) -
Web Crypto API

MIT licensed.
