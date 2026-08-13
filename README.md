# anonshare

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![CI](https://github.com/AvishkarKedar/textshare/actions/workflows/ci.yml/badge.svg)](https://github.com/AvishkarKedar/textshare/actions/workflows/ci.yml)

A live, end-to-end encrypted scratchpad for text and code. Open a room, share six
characters, write together. Nothing is stored once everyone leaves.

**[code.avishkark.in](https://code.avishkark.in)**

- No account, no email, no cookies, no analytics.
- AES-GCM encryption in the browser. The relay only ever forwards sealed bytes.
- Real-time multi-cursor editing with presence, chat, and syntax highlighting for 15 languages.
- Works offline and re-syncs when you come back.

> The GitHub repository and the relay Worker are still named `textshare`.
> Renaming a running Worker would break every invite link that has already been
> shared, so only the product name has changed.

---

## How it works

Three independent pieces:

| Piece | What it is | Where it runs |
|---|---|---|
| The app | Static HTML, CSS and one ES module | Cloudflare Pages, `tx.avishkark.in` |
| The relay | A Cloudflare Worker with one Durable Object per room | `textshare-sync.avishkarkedar.workers.dev` |
| The document | A Yjs CRDT, encrypted client-side | Your browser, and IndexedDB |

Editing is a CRDT, so there is no server-side merge and no lock contention. Two
people typing on the same line converge without either losing a keystroke. The
relay is deliberately dumb: it appends opaque frames to a log and fans them out.

### The key and the token

One password produces two unrelated values, via PBKDF2-SHA256 at 600,000
iterations with **different salts**:

```
key  = PBKDF2(code + ":" + password, salt = "textshare|CODE")       -> AES-GCM 256
auth = PBKDF2(code + ":" + password, salt = "textshare-auth|CODE")  -> 32 bytes
```

The key never leaves the browser. The `auth` token is presented to the relay to
prove you know the password; because the salt differs, it reveals nothing about
the key. The relay stores only `SHA-256(auth)`, so its own storage holds nothing
replayable.

The salt strings still read `textshare`. They are cryptographic constants, not
branding: changing them would lock every existing room out of its own data.

### Joining

A failed WebSocket upgrade gives JavaScript no status code, so the client proves
its token over plain HTTP first. `426 Upgrade Required` means the token was
accepted, `403` means the password is wrong. This is why a bad password says
"that password is not right" instead of connecting you to a room you cannot read.

```
GET /room/ABC123?a=<auth>          -> 426 ok | 403 wrong | 404 gone | 423 suspended
WSS /room/ABC123?a=<auth>&cid=<id>
```

Room codes are reserved exclusively at creation (`?create=1&excl=1`), so a
collision returns `409` and the client picks another code. Without that, two
strangers could land on one code holding two different keys.

### Owner rights

Creating a room mints a random 256-bit owner token, kept in local storage. Only
that browser can make the room read-only, suspend it, or delete it. The relay
holds only a hash. Clear your storage and the rights are gone for good.

See **[security.html](security.html)** for the full threat model, including what
this does *not* protect against.

---

## Features

**Collaboration** - live cursors with names, Google-Docs-style flags that fade and
return on hover, initials in the gutter, an "N people editing below" pill,
click an avatar to jump to someone, double-click to follow them, idle detection,
room chat with `@mentions`, and ephemeral cursor chat (`Alt` `/`).

**Editing** - CodeMirror 6, multiple files as tabs, undo/redo scoped per user,
find and replace, bracket matching, autocomplete, language auto-detection on
first paste, drag-and-drop file import, download one file or export all as a zip.

**Rooms** - optional password, read-only mode, suspend, permanent delete,
view-only invite links, and a choice of 10 minute / 1 hour / 24 hour lifetime
after the last person leaves.

**Interface** - command palette (`Ctrl`/`Cmd` `K`), dark and light themes that
follow the system, persistent identity colour, offline support via service
worker, and a mobile layout.

---

## Running it yourself

The front end is static files. Serve the repository root with anything:

```bash
python3 -m http.server 8000
```

The relay needs a Cloudflare account (the free tier is plenty):

```bash
cd worker
npm install
npx wrangler deploy
```

Point the app at your own relay with `?relay=your-worker.workers.dev`, or via
"use a different relay" in the footer. The choice is remembered.

### Deployment layout

| | |
|---|---|
| Pages project | root directory `/`, no build command, framework preset **None** |
| Worker project | root directory `worker`, build `npm install`, deploy `npx wrangler deploy` |

Keep the custom domain attached to **Pages only**. A Worker route outranks Pages
on the same hostname, which will serve raw JSON where your site should be.

---

## Limits

Per room: 30 connections, 120 messages/second, 256 KB per frame, 5 MB of log
before compaction. Per IP: 120 room lookups per minute.

---

## Known gaps

- `og.png` and `icon-180.png` are referenced but not yet in the repository, so
  link previews have no image and the iOS home-screen icon falls back.
- The Content Security Policy still allows inline scripts, because the ES module
  import map must be inline on static hosting and there is no server to mint a
  nonce.

---

## Contributing

Bug reports, feature ideas, and pull requests are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md) for how to run this locally, the test suite,
and the pull request process, and the [Code of Conduct](CODE_OF_CONDUCT.md) that
applies to all participation. Security issues should go through
[SECURITY.md](SECURITY.md) rather than a public issue.

## Licence

MIT. Built by [Avishkar Kedar](https://avishkark.in).
