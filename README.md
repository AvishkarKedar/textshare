# anonshare

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![CI](https://github.com/AvishkarKedar/textshare/actions/workflows/ci.yml/badge.svg)](https://github.com/AvishkarKedar/textshare/actions/workflows/ci.yml) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A live, end-to-end encrypted scratchpad for text and code. Open a room, share six
characters, write together. Nothing is stored once everyone leaves.

**[code.avishkark.in](https://code.avishkark.in)**

- No account, no email, no cookies, no analytics.
- AES-GCM encryption in the browser. The relay only ever forwards sealed bytes.
- Real-time multi-cursor editing with presence, chat, and encrypted file sharing.
- Sandboxed code runner: Python, JavaScript, C, C++, Java, Rust, Go, bash — executed on the self-hosted relay inside a bubblewrap namespace, never on a third-party API.
- Reconnects and re-syncs automatically when the link drops.

> The GitHub repository and the relay Worker are still named `textshare`.
> Renaming a running Worker would break every invite link that has already been
> shared, so only the product name has changed.

---

## Table of contents

- [Features](#features)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Running it yourself](#running-it-yourself)
- [Limits](#limits)
- [Security](#security)
- [Known gaps](#known-gaps)
- [Contributing](#contributing)
- [Licence](#licence)
- [Contact](#contact)

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

## How it works

Three independent pieces:

| Piece | What it is | Where it runs |
|---|---|---|
| The app | Next.js static export (this `src/` app) | Cloudflare Pages, `code.avishkark.in` |
| The relay | Node.js binary-WebSocket relay (`relay/server.js`), ws + bubblewrap sandbox | Oracle VPS, `relay.avishkark.in` |
| The fallback relay | Cloudflare Worker clone of the same protocol | `textshare-sync.avishkarkedar.workers.dev` |
| The document | A Yjs CRDT, encrypted client-side | Your browser |
| The functions | Pages Functions (`functions/api/*`): runner proxy, status probe, generative UI, crypto explainer | Cloudflare Pages |

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

### Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (React 19, Turbopack static export to `dist/`) |
| Styling & UI | Tailwind CSS 4, Lucide Icons, Radix UI primitives |
| Realtime data | [Yjs](https://docs.yjs.dev/) CRDT, `y-indexeddb`, WebSockets |
| Relay Transport | Plain WebSockets to a [Cloudflare Worker](https://workers.cloudflare.com/) / Relay VPS |
| Functions API | Cloudflare Pages Functions (`functions/api/*`) for runner & crypto |
| Room state | One [Durable Object](https://developers.cloudflare.com/durable-objects/) per room |
| Crypto | Browser-native `SubtleCrypto` (AES-GCM 256, PBKDF2-SHA256, 600,000 rounds) |
| Offline | Service worker (`public/sw.js`) + IndexedDB persistence |
| Tests | [Vitest](https://vitest.dev/) (56 tests) |
| Hosting | Cloudflare Pages (`code.avishkark.in`) + Cloudflare Workers |

---

## Project structure

```
.
├── src/                     the Next.js App Router application (the whole UI)
│   ├── app/                 layout.tsx, page.tsx, globals.css (design tokens + 5 themes)
│   ├── components/
│   │   ├── landing/         hero, animated demo, use cases, FAQ, footer
│   │   ├── editor/          app shell, top bar, tabs, editor stage, chat, terminal, status bar
│   │   ├── palette/         modals & drawers (invite, settings, history, files, generative,
│   │   │                    browser, crypto, status, security, privacy/terms, FAQ, entry dialog…)
│   │   └── ui/              shadcn-style primitives
│   └── lib/                 store (zustand), relay (binary WS protocol + E2EE),
│                            session (Yjs ↔ store bridge), detect, highlight, themes
├── functions/api/           Cloudflare Pages Functions — the real /api/run, /api/crypto,
│                            /api/status, /api/generate edge handlers (production API)
├── relay/                   self-hosted Node.js relay: WebSocket rooms + Bubblewrap code
│                            sandbox (deploy guide, Caddy/nginx/systemd/Docker configs inside)
├── worker/                  optional Cloudflare Worker fallback relay (Durable Objects)
├── mini-services/           anonshare-sync — small local sync service for development
├── admin/                   standalone relay admin dashboard (stats, moderation)
├── scripts/                 live verification & ops scripts (relay probes, runner matrix, e2e)
├── tests/                   Vitest suite (crypto contract, language detection, registries)
├── public/                  static assets (sw.js, manifest, _headers, robots, sitemap, icons)
├── prisma/                  database schema for the local dev database
├── docs (root .md files)    PRD, Architecture, SECURITY policy, COMPLIANCE, CONTRIBUTING,
│                            design/tasks/rules for agents, COMMANDS protocol
└── next.config.ts           static export config (+ dev-only /api rewrites)
```

**Where things happen:** UI entry is `src/app/page.tsx` → `src/lib/store.ts` (state) →
`src/lib/session.ts` (Yjs) → `src/lib/relay.ts` (encrypted WebSocket). Code execution flows
`runCode()` → `/api/run` → `functions/api/run.ts` → the relay's sandbox. Every layer is
open source in this repository.

---

## Running it yourself

```bash
npm install
npm run relay        # starts the sync relay + code runner on :8787
node scripts/dev-api-shim.js   # (dev only) mirrors the edge /api/* functions on :8788
npm run dev           # Next.js app on :3000 (auto-targets localhost:8787,
                      # and dev-only rewrites proxy /api/* → :8788)
```

The dev shim stands in for the Cloudflare Pages Functions so the code runner,
status probe, and crypto explainer work locally exactly as they do in
production. It is never part of the build.

The relay needs Node 18+. The code runner uses bubblewrap + prlimit when
available (`/usr/bin/bwrap`, `/usr/bin/prlimit`); without them it runs without
the namespace sandbox — only deploy it that way on machines you trust.

**Required environment variables (relay):**

| Variable | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Enables `/admin/*` moderation API. **There is no default — if unset, the admin API is fully disabled (503).** Never commit it. |
| `PORT` / `HOST` | Listen address (default `8787` / `0.0.0.0`). |
| `CHUNK_STORAGE_DIR` | Where encrypted file chunks are spilled (default tmpdir). |

**Optional (Pages project):** attach the `AI` binding (Cloudflare Pages →
Settings → Bindings → Workers AI) to get real LLM output in the Generative UI
(`@cf/meta/llama-3.1-8b-instruct`). Without it, the endpoint returns an
honestly-labeled deterministic template.

---

## Deploying (operator checklist)

After pulling changes:

1. **Relay (VPS)** — `git pull && systemctl restart anonshare-relay` (or however
   `relay/server.js` is supervised). The runner fixes (JS/Go/Rust sandbox
   limits, admin hardening) only take effect after this.
2. **App + functions (Cloudflare Pages)** — redeploy the Pages project (usually
   automatic on push to `main`). Picks up the client, status API, test runner,
   and file-sharing changes.
3. **Rotate `ADMIN_PASSWORD`** if it was ever exposed (it was, historically, in
   this repo's history — set a fresh strong value in the relay's environment).

---

```bash
# Run unit tests
npm test

# Build static production export (outputs to dist/)
npm run build
```

### Cloudflare Pages Deployment

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Node.js version | `20.x` or `22.x` |


Keep the custom domain attached to **Pages only**. A Worker route outranks Pages
on the same hostname, which will serve raw JSON where your site should be.

---

## Limits

Per room (VPS relay): 120 connections, 200 messages/second, 512 KB per frame,
10 MB of log before compaction. Per IP: 600 requests/min, 60 room creates/min,
8 auth attempts/min, 20 code runs/min. The Cloudflare Worker fallback uses
tighter limits (60 connections, 5 MB log, 300 req/min).

---

## Security

See **[security.html](security.html)** for the full threat model — what the
encryption here does and does not protect against — and
[COMPLIANCE.md](COMPLIANCE.md) for data-handling notes. To report a
vulnerability privately, follow [SECURITY.md](SECURITY.md) rather than opening
a public issue.

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
applies to all participation. Issue and pull request templates live under
[`.github/`](.github). Security issues should go through
[SECURITY.md](SECURITY.md) rather than a public issue.

## Licence

MIT — see [LICENSE](LICENSE). Built by [Avishkar Kedar](https://avishkark.in).

## Contact

- Email: [avishkarkedar+text@gmail.com](mailto:avishkarkedar+text@gmail.com)
- GitHub: [github.com/AvishkarKedar/textshare](https://github.com/AvishkarKedar/textshare)
- Author: [github.com/AvishkarKedar](https://github.com/AvishkarKedar)
