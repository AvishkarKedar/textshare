# AnonShare

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![CI](https://github.com/AvishkarKedar/textshare/actions/workflows/ci.yml/badge.svg)](https://github.com/AvishkarKedar/textshare/actions/workflows/ci.yml) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A live, end-to-end encrypted collaborative editor and code runner. Open a room,
name it, share the six-character code, and write together — text, code, chat,
and files — with everything sealed in the browser before it leaves. Run code
in eight languages on a self-hosted, bubblewrap-sandboxed runner. Nothing is
stored once everyone leaves.

**[code.avishkark.in](https://code.avishkark.in)** — this README documents the
working tree at v5.6.0.

> The GitHub repository and the backup relay Worker are still named
> `textshare` for legacy reasons. Renaming a running Worker would break every
> invite link already shared, so only the product name changed.

---

## Table of contents

- [What it is](#what-it-is)
- [Features](#features)
- [How it works](#how-it-works)
- [Slash commands](#slash-commands)
- [The code runner](#the-code-runner)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Running locally](#running-locally)
- [Testing](#testing)
- [Deployment](#deployment)
- [Limits](#limits)
- [Known gaps](#known-gaps)
- [Security](#security)
- [Contributing](#contributing)
- [Licence](#licence)
- [Contact](#contact)

---

## What it is

AnonShare is a zero-setup shared scratchpad: no account, no email, no cookies
for tracking, no analytics tied to individuals. You type a room name, pick a
lifetime (10 minutes, 1 hour, or 24 hours after the last person leaves),
optionally set a password, and hand the generated room code to someone. From
that moment you are editing the same documents with live cursors, chat, and
encrypted file sharing.

The privacy claim is structural, not a policy statement: documents are a
[Yjs](https://docs.yjs.dev/) CRDT encrypted in the browser with AES-GCM-256
under a key derived from the room code and password. The relays that move the
bytes — a self-hosted Node.js VPS relay, with a Cloudflare Worker clone as
automatic failover — only ever handle sealed ciphertext plus routing metadata
(IP for rate limiting, message sizes, peer counts). They hold no key that
could decrypt what they carry, and rooms evaporate when their TTL expires.

The same site is also a small code playground. The Run button executes the
active file in Python, JavaScript, C, C++, Java, Rust, Go, or bash on the
self-hosted relay inside a bubblewrap namespace with no network access — never
on a third-party execution API. A learn panel ships runnable starter files
(including stdin examples), an LLM council can review the active file when the
deployment has an AI binding, and a session goal can be pinned for everyone in
the room.

---

## Features

**Rooms and privacy** — every room gets a compulsory name (it replicates to
every peer's header, so an unnamed room can't masquerade as "Untitled
session"); optional password; read-only (lock) mode; suspend; permanent delete
that kills every socket and purges the room plus its encrypted file chunks;
an invite modal with code, link, and QR-code sharing (edit/view role encoded
in the link); TTL of 10 minutes / 1 hour / 24 hours after the last
participant leaves; room codes are six characters from an unambiguous alphabet
(no `I`, `L`, `O`, `0`, `1`) and are reserved exclusively at creation, so a
collision returns `409` and the client picks another code.

**Real-time collaboration** — a custom lightweight editor (a transparent
textarea layered over a live syntax-highlighted overlay) on a Yjs CRDT, so two
people typing on the same line converge without losing a keystroke and there
is no server-side merge; live remote cursors and selection ranges tinted in
each author's colour; "X is typing…" indicators (per-location: editor or
chat); multi-file tabs with per-author chat attribution, message pinning,
threads, and code blocks; optional display name at room entry (blank gives a
random guest handle like `raven-otter-42`, persisted locally); encrypted
file sharing up to 25 MB per file; automatic reconnect with exponential
backoff, failover to a backup relay, and room self-heal after a relay restart;
offline loading of the app itself via a service-worker app shell.

**The code runner** — run the active file with `Ctrl`/`Cmd` `Enter` or the Run
button; eight languages on a bubblewrap + prlimit sandbox with no network,
ephemeral per-run workspaces, and per-language resource caps; stdin support
(one line per `input()` / `scanf` / `cin` read — the terminal drawer has a
dedicated input box); C++-in-a-`.c`-file auto-detection routes to g++ instead
of failing; HTML/SVG/Markdown files mount a live interactive preview instead
of executing; TypeScript is accepted and executed as JavaScript; a curated
Python bundle (numpy, pandas, sympy, matplotlib, requests, beautifulsoup4,
pillow) is pre-installed on the runner, owner-configurable via
`PY_BOOTSTRAP_PACKAGES`.

**Learning and review tools** — a teamwork panel (`/teamwork`) showing who is
in the room right now, invite actions, and room facts; a learn panel (`/learn`)
of runnable starter files across all eight languages, including stdin-teaching
examples; an LLM council (`/llm-council`) where three reviewer personas (bug
hunter, clarity judge, test designer) analyse the active file — when the Pages
project has the Workers AI binding this is a real LLM review, and when it does
not the endpoint answers honestly with `configured: false` rather than
fabricating reviews; a session goal (`/goal`) that pins a shared objective,
replicated through the encrypted document so everyone sees the same banner.

**Interface** — command palette (`Ctrl`/`Cmd` `K`) with recents; slash
commands in the editor (type `/`, 24 commands); five themes (Vanta Black,
Paper, Dracula, Nord, Monokai), persisted per browser with dark as the
default; zen mode; find and replace with case-sensitive and regex modes; real
per-file history
("time machine") plus named snapshots; syntax highlighting toggle; markdown
preview; in-app browser drawer with document chips; notifications panel with
mentions; onboarding tour; a live status modal that actually probes the relay
(no hardcoded uptime); keyboard-shortcut overlay (`?`); mobile layout with a
collapsible symbol bar.

---

## How it works

Five moving parts, one wire protocol:

```
┌────────────────────────────────────────────────────────────────────┐
│                              Browser                               │
│   Next.js app (static export, served by Cloudflare Pages)          │
│   - Yjs CRDT docs: files / texts / chat / shared meta / goal       │
│   - Awareness: cursors, selections, presence, typing               │
│   - AES-GCM-256 sealing under a key derived in-browser             │
│     (PBKDF2-SHA256, 600,000 rounds) — key never transmitted        │
└────────────┬───────────────────────────────┬───────────────────────┘
   sealed binary WSS frames        HTTPS POST /api/run (edge function)
   localhost:8787 in development           │
             ▼                              ▼
┌───────────────────────────┐     ┌─────────────────────────────────┐
│ Primary relay (VPS)       │ /run│ Cloudflare Pages Functions      │
│ relay.avishkark.in        │◄────┤ functions/api/{run,status,      │
│ Node.js + ws              │     │ crypto,generate,council}.ts     │
│ - room log + fan-out      │     └─────────────────────────────────┘
│ - encrypted chunk store   │
│ - IP rate limits          │     (/api/generate and /api/council use
│ ┌───────────────────────┐ │      the optional Workers AI binding —
│ │ bubblewrap + prlimit  │ │      without it they answer honestly)
│ │ sandbox: no network,  │ │
│ │ tmpfs /tmp, ro /usr   │ │
│ │ python·js·c·cpp·      │ │
│ │ java·rust·go·bash     │ │
│ └───────────────────────┘ │
└─────────────┬─────────────┘
              │ health probe / room lookup — automatic failover
              ▼
┌───────────────────────────────────────────────┐
│ Backup relay — Cloudflare Worker              │
│ textshare-sync.avishkarkedar.workers.dev      │
│ one Durable Object per room (Room, Limiter,   │
│ Registry) — same protocol, no code runner     │
└───────────────────────────────────────────────┘
```

### What the relays can and cannot see

They see: that a room code exists, how many sockets are attached, message
sizes and timing, your IP (for rate limiting), a salted SHA-256 of your auth
token, a hash of the owner token, and — only if the operator enables
`ADMIN_PASSWORD` — a moderation index of active room codes with creation
time, TTL, and whether a password is set. They cannot see: content, chat,
display names, cursors, file bytes (every chunk is AES-GCM sealed before
upload), the password, or the key. Compromising either relay yields opaque
blobs.

### The key and the token

One password produces two unrelated values via PBKDF2-SHA256 at 600,000
iterations with **different salts**:

```
key  = PBKDF2(code + ":" + password, salt = "textshare|CODE")       -> AES-GCM 256
auth = PBKDF2(code + ":" + password, salt = "textshare-auth|CODE")  -> 256-bit token
```

The key never leaves the browser. The `auth` token is presented to the relay
to prove you know the password; because the salt differs, it reveals nothing
about the key. The relay stores only `SHA-256(auth)`, so its storage holds
nothing replayable. The salt strings still read `textshare`: they are
cryptographic constants, not branding — changing them would lock every
existing room out of its own data.

### Joining a room

A failed WebSocket upgrade gives JavaScript no status code, so the client
proves its token over plain HTTP first:

```
create: POST /room/CODE?create=1&excl=1&a=<auth>&o=<owner>&ttl=<ttl>&p=<0|1>   -> 426 | 409 | 429
join:   GET  /room/CODE?a=<auth>[&o=<owner>]        -> 426 accepted | 403 wrong password | 404 gone | 423 suspended
exists: GET  /room/CODE/exists                       -> { exists, peers, hasPassword, auth, suspended, locked, ownerless? }
sync:   WSS  /room/CODE?a=<auth>&o=<owner>&cid=<id>  (binary frames, type byte + payload)
```

`426 Upgrade Required` means the token was accepted; `403` means the password
is wrong — a wrong password is refused outright rather than connecting you to
a room whose bytes you cannot decrypt.

### Owner rights

Creating a room mints a random 256-bit owner token, kept in that browser's
local storage (`ts.own.<CODE>`). Only that browser can lock, suspend, change
the TTL of, or delete the room via `POST /room/:code/admin` — and a
participant the owner grants edit rights to (T_GRANT) can write to a locked
room. The relays hold only hashes of these tokens. Clear your storage and the
rights are gone for good; nobody can recover them for you, by design.

### Failover and self-healing

The client keeps an ordered candidate list — home relay, then the backup
Worker — and uses it everywhere: room creation and join fail over on
infrastructure errors only (a busy/collision/4xx verdict is final and not
worth retrying elsewhere); "gone" on one relay is retried on the other,
because the room may live there. A live connection that drops walks the
candidates with exponential backoff (up to 15 s). If a healthy relay has lost
the room (a VPS restart wipes in-memory rooms), an established session
reconnects with `create=1` so the room springs back and is re-seeded from
that browser's Yjs document; the auth token still gates who may resurrect it.
If a re-creation race left the room ownerless, the owner's reconnect claims
ownership back and delete/lock/suspend keep working.

---

## Slash commands

The complete registry lives in `src/lib/store.ts` (`SLASH_COMMANDS`); this
table matches it verbatim. In the editor, type `/` and filter with the
keyboard:

| Trigger | Action | What it does |
|---|---|---|
| `/run` | Run code | execute the active file |
| `/goal` | Set a goal | pin a session objective |
| `/teamwork` | Teamwork panel | who's in · invite · room facts |
| `/learn` | Learn by example | runnable starter files |
| `/llm-council` | LLM council | AI agents review the active file |
| `/faq` | FAQs & Help | honest answers to all questions |
| `/help` | Show help | list all slash commands |
| `/generative` | Generative UI | build UI from a prompt |
| `/browser` | Open browser | in-app web view with doc chips |
| `/crypto` | Crypto explainer | see the real PBKDF2 flow |
| `/status` | System status | relay metrics + health check |
| `/security` | Threat model | honest security write-up |
| `/history` | Time machine | travel through revisions |
| `/snap` | Name a snapshot | bookmark this moment |
| `/export` | Export project ZIP | download all files as .zip |
| `/files` | Open files drawer | upload + share files |
| `/share` | Copy share link | copy room URL to clipboard |
| `/find` | Find in file | search + replace (⌘F) |
| `/format` | Format code | prettify the active file |
| `/syntax` | Toggle syntax highlight | color the editor |
| `/clear` | Clear editor | wipe the active file |
| `/zen` | Toggle zen mode | distraction-free editor |
| `/tour` | Restart tour | guided onboarding walkthrough |
| `/shrug` | Shrug | send `¯\_(ツ)_/¯` to chat |

---

## The code runner

Execution flows `runCode()` → `POST /api/run` (Pages edge function, which
validates language/source/stdin sizes and rate-limits per IP) →
`POST https://relay.avishkark.in/run` on the VPS → a fresh temp workspace per
run → `prlimit` + `bubblewrap` (unshared everything, **no network**, read-only
`/usr` `/lib` `/bin` `/etc`, tmpfs `/tmp`, `--die-with-parent`).

| Language | Accepted names | Toolchain | Notes |
|---|---|---|---|
| Python | `python`, `py` | `python3` | stdlib plus the bootstrapped bundle (see `PY_BOOTSTRAP_PACKAGES`); `MPLBACKEND=Agg` for headless matplotlib |
| JavaScript | `javascript`, `js`, `node`, `typescript`, `ts` | `node` (`--max-old-space-size=256`) | TS is accepted and executed as JS |
| C | `c` | `gcc -O2` | C++-only headers/`std::` auto-route to g++ (checked on client, edge, and relay) |
| C++ | `cpp`, `c++` | `g++ -O2 -std=c++20` | |
| Go | `go`, `golang` | `go run` | |
| Rust | `rust`, `rs` | `rustc -O` | |
| bash | `bash`, `sh` | `bash` | |
| Java | `java` | `javac` then `java` | matches any top-level class declaration, not just `public class`; `-Xmx128m -XX:+UseSerialGC` |

**stdin is supported in every language.** The terminal drawer has a dedicated
input box; input is piped to the process and stdin is closed (EOF) when the
box is empty, so a blocking `input()` fails fast instead of hanging. Runs are
cached 15 seconds per identical (language, code, stdin) triple.

**Runner limits:** 8 s execution (10 s for Java runs; compile steps 10–14 s),
256 KB source, 64 KB stdin, ~100 KB captured output, 4 concurrent
runs with queueing, 20 runs per IP per minute, per-language memory caps
(RLIMIT_DATA for VA-hungry runtimes — JVM, node, Go, rustc; RLIMIT_AS for the
rest). Anything else returns an honest `400 language_not_supported` listing
the supported set — there is no silent fallback to a public execution API
(the old Piston fallback was removed when that API became whitelist-only).

**Java deployment caveat:** the JVM needs the split Debian/Ubuntu JDK config
directories bound into the sandbox, so `relay/server.js` explicitly binds
`/etc/java-{21,17,11}-openjdk` when running `javac`/`java`. An older relay
deployment that binds `/etc` only selectively makes `javac` die with
`InternalError: Error loading java.security file`. The fix is in this
repository; if the production relay shows that error, it needs one redeploy
(`git pull` + `systemctl restart anonshare-relay` on the VPS) — the `/learn`
panel labels its Java starter accordingly.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router (React 19), static export to `dist/` |
| Styling & UI | Tailwind CSS 4, Lucide icons, Radix UI primitives, framer-motion |
| State | Zustand 5 with `persist` middleware (`src/lib/store.ts`) |
| Realtime data | Yjs 13 CRDT + `y-protocols` awareness over binary WebSockets |
| Crypto | Browser-native Web Crypto: AES-GCM-256, PBKDF2-SHA256 (600,000 rounds) |
| Relay (primary) | Node.js + `ws`, bubblewrap + prlimit sandbox (`relay/server.js`) |
| Relay (backup) | Cloudflare Worker, Durable Objects (`worker/`) |
| Functions API | Cloudflare Pages Functions (`functions/api/`) |
| Offline | Service worker app shell (`public/sw.js`) |
| Tests | Vitest (`npm test`) plus live verification scripts in `scripts/` |
| Hosting | Cloudflare Pages (`code.avishkark.in`) + self-hosted VPS + Cloudflare Workers |

---

## Project structure

```
.
├── src/                        the Next.js App Router application (the whole UI)
│   ├── app/                    layout.tsx, page.tsx (landing + editor in one route),
│   │                           globals.css (design tokens + the 5 themes)
│   ├── components/
│   │   ├── landing/            hero, animated demo card, how-it-works, use cases,
│   │   │                       stats strip, FAQ, CTA banner, footer
│   │   ├── editor/             AppShell, TopBar, TabBar, EditorStage, FindBar,
│   │   │                       TerminalDrawer (stdin box), ChatSidebar, GoalBanner,
│   │   │                       MarkdownPreview, MobileNav, StatusBar
│   │   ├── palette/            CommandPalette, SlashCommandPopup, RoomEntryDialog,
│   │   │                       TeamworkPanel, LearnPanel, CouncilModal, InviteModal,
│   │   │                       SettingsPanel, HistoryDrawer, FilesDrawer, GenerativeModal,
│   │   │                       BrowserDrawer, CryptoModal, StatusModal, SecurityModal,
│   │   │                       NotificationsPanel, OnboardingTour, ShortcutsOverlay, …
│   │   └── ui/                 shared primitives (toast/sonner wrappers)
│   └── lib/                    store.ts (zustand state, SLASH_COMMANDS, SHORTCUTS),
│                               relay.ts (binary WS protocol, E2EE, failover),
│                               session.ts (Yjs ↔ store bridge, file chunks),
│                               detect.ts, highlight.ts, identity.ts, themes.ts,
│                               use-sync.ts (presence mirror)
├── functions/api/              Cloudflare Pages Functions — the production
│                               /api/run, /api/status, /api/crypto,
│                               /api/generate, /api/council edge handlers
├── relay/                      self-hosted Node.js relay: WebSocket rooms,
│                               bubblewrap-sandboxed runner, admin API
│                               (server.js + Dockerfile, docker-compose.yml,
│                               systemd.service, Caddyfile, nginx.conf, README.md)
├── worker/                     backup Cloudflare Worker relay (Durable Objects:
│                               Room, Limiter, Registry) + wrangler.toml
├── admin/                      standalone relay admin dashboard (stats, moderation)
├── scripts/                    live verification & ops scripts + dev API shim
│                               (see scripts/README.md)
├── tests/                      Vitest suite: app-core.test.ts, relay-crypto.test.ts
├── public/                     static assets (sw.js, manifest, _headers with CSP,
│                               robots, sitemap, og.png, icons, IndexNow key)
├── prisma/                     schema.prisma for the local dev database
├── mini-services/anonshare-sync/  legacy local dev helper: a small socket.io
│                               presence service on :3003 — the shipped app does
│                               not use it (the client speaks the binary relay
│                               protocol in src/lib/relay.ts instead)
└── next.config.ts              static export config + dev-only /api rewrites
```

**Where things happen:** UI entry is `src/app/page.tsx` → `src/lib/store.ts`
(state and actions) → `src/lib/session.ts` (Yjs document, chat, goal, file
encryption) → `src/lib/relay.ts` (encrypted WebSocket + failover). Code
execution flows `runCode()` → `/api/run` → `functions/api/run.ts` → the
relay's sandbox. Every layer is open source in this repository.

---

## Running locally

Three processes, three terminals (Node 18+ for the relay; Node 20/22 for the
app):

```bash
npm install
npm run relay                   # relay/server.js — sync relay + code runner on :8787
node scripts/dev-api-shim.js    # (dev only) mirrors the edge /api/* functions on :8788
npm run dev                     # Next.js app on :3000
```

How the pieces find each other:

- On `localhost` / `127.0.0.1` the client targets the relay at `localhost:8787`
  (`relayHost()` in `src/lib/relay.ts`); elsewhere it uses `DEFAULT_RELAY` or
  `NEXT_PUBLIC_RELAY_HOST`. A `?relay=host` URL parameter overrides both and
  still fails over to the backup afterwards.
- In dev, `next.config.ts` rewrites `/api/run`, `/api/status`, `/api/crypto`,
  and `/api/generate` to the shim on `127.0.0.1:8788`, which mirrors the Pages
  function contracts and proxies `/run` to `RELAY_URL` (default
  `https://relay.avishkark.in`). The rewrites are dev-only — the production
  build is a pure static export. The shim does not mirror `/api/council`;
  that one only works against a deployed Pages project.
- The runner uses bubblewrap + prlimit when `/usr/bin/bwrap` and
  `/usr/bin/prlimit` exist; without them it runs **without** the namespace
  sandbox — only deploy it that way on machines you trust.

Relay environment variables (all optional; the relay fails closed on the
important ones):

| Variable | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Enables the `/admin/*` moderation API. **No default — if unset, the admin API is fully disabled (503).** Rotate it if it was ever exposed. |
| `PORT` / `HOST` | Listen address (default `8787` / `0.0.0.0`). |
| `CHUNK_STORAGE_DIR` | Where encrypted file chunks are spilled (default tmpdir). |
| `ALLOWED_ORIGINS` | Browser origins allowed on the HTTP API (exact, `*.suffix`, or `*`). Default: the production sites + localhost. WebSocket connections are unaffected. |
| `TRUSTED_PROXIES` | CIDRs whose forwarded-IP headers are honored for rate limiting (default loopback + RFC1918; `off` disables header trust). |
| `PY_BOOTSTRAP_PACKAGES` | pip names installed once at boot into the service user's `~/.local`, read-only-bound into every sandbox. Default: `numpy,pandas,sympy,matplotlib,requests,beautifulsoup4,pillow`. Empty string disables. |

```bash
npm test        # Vitest unit tests
npm run build   # prisma generate + next build (static export to dist/)
```

---

## Testing

**Unit tests** (`npm test`, Vitest, `tests/`):

- `relay-crypto.test.ts` — the real crypto contract: room codes are 6 chars
  from the unambiguous alphabet and collision-resistant; PBKDF2-SHA256 at
  600,000 rounds with two distinct salts; deterministic key + auth derivation;
  url-safe auth tokens; exactly the three documented TTLs.
- `app-core.test.ts` — language detection (Python/JS/C/C++/Go/Rust/HTML/
  Markdown/SQL signatures), extension ↔ language mapping, shortcut and slash
  command registries (unique keys, live features only), identity helpers
  (name sanitisation, guest handle shape, rejecting the legacy "you").

**Live verification scripts** (`node scripts/<name>.mjs`, Node 18+, run
against production — see `scripts/README.md` for expected green counts):

| Script | What it proves |
|---|---|
| `relay-version-discriminator.mjs` | which relay generation the VPS runs (CORS allowlist, preflight, file DELETE, `/run` whitelist, security headers) — run this first after a redeploy |
| `e2e-live-sync.mjs` | the full sync protocol against the live relay: create, two WSS peers, AES-GCM-sealed updates both ways, backlog replay, awareness, owner grant, chunk roundtrip + delete, wrong-password rejection, T_KILLED teardown |
| `runner-matrix.mjs` | one program per language across all 8 plus multi-line stdin with CRLF line endings |
| `live-endpoint-verify.mjs` | Pages functions (status/run/generate/crypto: validation, rate limits, honesty labels) + relay basics + old-relay tripwires |

CI (`.github/workflows/ci.yml`) runs `npm install`, `npm test`, and
`npm run build` on Node 22 for every push to `main` and every pull request.

---

## Deployment

### App + functions (Cloudflare Pages)

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Node.js version | 20.x or 22.x |

`functions/api/*` deploy with the Pages project automatically. Keep the custom
domain attached to **Pages only** — a Worker route on the same hostname
outranks Pages and would serve raw JSON where the site should be.

### Relay (self-hosted VPS)

Three supported supervision styles, all with configs in `relay/`:

- **Docker Compose** — `cd relay && docker compose up -d` (node:20-alpine,
  non-root, port 8787; set `ADMIN_PASSWORD` in `.env`).
- **systemd** — install `relay/systemd.service` (`/opt/anonshare-relay`,
  `Restart=always`); set `ADMIN_PASSWORD` via a systemd override, never in
  the public unit file.
- **PM2** — `pm2 start server.js --name anonshare-relay && pm2 save`.

Terminate TLS with Caddy or nginx (both configs included) behind Cloudflare
DNS (proxied A record, SSL mode Full). Point clients at your relay by
changing `DEFAULT_RELAY` in `src/lib/relay.ts`, or per-visit with
`?relay=your.relay.host`. Full guide: [relay/README.md](relay/README.md).

**After pulling changes, restart the relay** — runner fixes (sandbox memory
caps, the JVM `/etc/java-*` binds, the Python bundle) only take effect then.
The relay's `/health` always reports `version: 4`; judge deployments by the
run probes, not that field.

### Backup relay (Cloudflare Worker)

```bash
cd worker
npx wrangler deploy          # uses worker/wrangler.toml (Durable Objects: Room, Limiter, Registry)
npx wrangler secret put ADMIN_PASSWORD   # optional; without it /admin/* is 503
```

The Worker speaks the same wire protocol as the VPS relay, so the client's
failover needs no configuration. It has no code runner — execution always
happens on the VPS relay.

### Optional: Workers AI binding

Attach the `AI` binding (Cloudflare Pages → Settings → Bindings → Workers
AI) to enable real LLM output in the Generative UI and the LLM council
(model `@cf/meta/llama-3.1-8b-instruct`). Without it, `/api/generate` returns
a deterministic template labelled `anonshare-template-engine` (never
presented as AI) and `/api/council` answers `configured: false` with an
explanatory notice — the UI shows "no model bound" and never fabricates
reviews.

### Operator checklist after any deploy

1. Redeploy the relay on the VPS and confirm the runner:
   `curl -s -X POST https://relay.avishkark.in/run -H 'Content-Type: application/json' -d '{"language":"python","code":"print(1+1)"}'`
2. Redeploy Pages (usually automatic on push to `main`).
3. Rotate `ADMIN_PASSWORD` if it was ever exposed (it was, historically, in
   this repository's history).

---

## Limits

Per room (VPS relay): 120 connections, 200 messages/second, 512 KB per frame,
10 MB of log before compaction, 24 concurrent WebSocket connections per IP.
Per IP per minute: 600 general requests, 60 room creates, 8 failed auth
attempts, 20 code runs. Encrypted file storage: 25 MB per file (64 KB
chunks), 32 files and 50 MB per room, 400 chunks per file. The backup Worker
uses tighter caps: 60 connections, 120 messages/second, 256 KB frames, 5 MB
room log, 300 requests/20 creates/8 auth attempts per IP per minute. Runner
limits are listed under [The code runner](#the-code-runner).

---

## Known gaps

- **Java on the current production relay** needs the redeploy described above
  if it is still running a pre-fix build: `javac` fails with
  `InternalError: Error loading java.security file` because the older bwrap
  profile did not bind the split JDK config directories. The fix is in
  `relay/server.js` in this tree; the other seven languages are unaffected.
- No persistence beyond the TTL: rooms and their encrypted content are
  discarded after the lifetime expires past the last participant. There is no
  server-side archive and no full local backup — the live document lives in
  the open browser tabs; the service worker only caches the app shell
  (Settings still offers "Clear offline copy" for a legacy `anonshare-offline`
  IndexedDB database nothing writes to anymore).
- A VPS relay restart wipes in-memory rooms; connected clients self-heal
  (re-create and re-seed from their local doc), but a room whose every member
  was offline at that moment stays gone.
- The Content Security Policy (`public/_headers`) still allows inline
  scripts: the ES module import map must be inline on static hosting and
  there is no server to mint a nonce.
- `/api/council` and `/api/generate` answer with honest fallbacks unless the
  Pages project has the Workers AI binding; the dev shim does not mirror
  `/api/council` at all.
- The app is a single page (`src/app/page.tsx`): landing and editor are one
  route with client-side view switching. The landing join box prefills from
  a `#CODE` URL hash, but the `?join=CODE` links the invite modal builds are
  not parsed on load — a recipient lands on the landing page and re-enters
  the code.
- `functions/api/index.ts` still advertises the older endpoint list (4
  endpoints, no `/api/council`); the individual functions are current.
- No accounts, no recovery: clearing local storage drops owner tokens and
  saved preferences for good.

---

## Security

Content, chat, cursors, and file chunks are AES-GCM-256 sealed in the
browser under a PBKDF2-SHA256-derived key (600,000 rounds) that never
transmits; the relays store only hashes of the auth/owner tokens and cannot
decrypt anything they carry; wrong passwords are refused at the HTTP layer;
rooms expire and purge; the runner is network-isolated with rlimit caps; the
admin surface fails closed unless `ADMIN_PASSWORD` is set; and the pages ship
a strict CSP plus HSTS, nosniff, frame-deny and referrer-free headers. The
honest caveats — metadata the relays inevitably see, endpoint compromise
scenarios, what E2EE does not protect against — are written up in
[SECURITY.md](SECURITY.md) (how to report a vulnerability),
[WHITEPAPER.md](WHITEPAPER.md) (the full threat model), and
[COMPLIANCE.md](COMPLIANCE.md) (data handling). The same threat model is
in-app via `/security` or `Ctrl`/`Cmd` `Shift` `X`. Please report
vulnerabilities privately, not as public issues.

---

## Contributing

Bug reports, feature ideas, and pull requests are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the local setup, tests, and the pull
request process, and the [Code of Conduct](CODE_OF_CONDUCT.md) that applies to
all participation. Issue and pull request templates live under
[`.github/`](.github); security issues go through [SECURITY.md](SECURITY.md).
The working task list — including known issues being tracked right now — is
[pending.md](pending.md).

## Licence

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Avishkar Vishnu Kedar.
Built by [Avishkar Kedar](https://avishkark.in).

## Contact

- Email: [avishkarkedar+text@gmail.com](mailto:avishkarkedar+text@gmail.com)
- Repository: [github.com/AvishkarKedar/textshare](https://github.com/AvishkarKedar/textshare)
- Author: [github.com/AvishkarKedar](https://github.com/AvishkarKedar)
