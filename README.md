# textshare

Share text and code between two or more computers, live. One person creates a room, everyone
else opens the same 8-character code, and from then on every keystroke shows up on every
screen — with syntax highlighting, live cursors, and no sign-up.

```
  PC 1  ──────────┐                              ┌────────── PC 2
  types           │   direct WebRTC data channel │           types
  "const x = 1"   └──────────────────────────────┘   "// hello"
                    (encrypted with the room code)
```

**Zero backend.** There is no server storing your text, no database, no account. `index.html`
is the whole app — the browsers talk straight to each other.

---

## Features

| | |
|---|---|
| **Real-time editing** | Character-level sync. Two people can type on the same line at the same time and nothing is overwritten. |
| **Live cursors & presence** | See where everyone is, what they've selected, and who is in the room. |
| **Syntax highlighting** | 15 languages (JS, TS, Python, HTML, CSS, JSON, YAML, SQL, Java, C/C++, Go, Rust, Shell, Markdown, plain text). The language picker is synced too. |
| **Dark + light theme** | Follows your system by default, toggle with one click, remembered per device. |
| **Copy & download** | Copy the whole document, or save it with the right file extension (`Ctrl/Cmd + S`). |
| **Undo/redo that respects others** | `Ctrl/Cmd + Z` undoes *your* edits, not your teammate's. |
| **Tab / Shift+Tab indent** | Works on a selection, like a real editor. |
| **Invite link** | The room code lives in the URL hash — copy the link, send it, done. |

---

## Quick start (local)

The app loads ES modules, so open it through a server rather than double-clicking the file:

```bash
git clone https://github.com/AvishkarKedar/textshare.git
cd textshare
python3 -m http.server 8080
```

Open `http://localhost:8080`, click **Create a room**, and open the same URL (including the
`#CODE` part) on the other machine. On a different computer, use your LAN IP or deploy it.

---

## Deploy on Cloudflare Pages (with your own domain)

No build step, no environment variables, no server.

1. In the Cloudflare dashboard go to **Workers & Pages → Create → Pages → Connect to Git**.
2. Authorize GitHub and pick the **`textshare`** repository.
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **`/`**
   - Root directory: *(leave empty)*
4. **Save and Deploy.** You get `https://textshare-xxx.pages.dev` in under a minute.
5. Custom domain: open the project → **Custom domains → Set up a domain** → enter
   `share.yourdomain.com` (or the apex `yourdomain.com`). If the domain is already on your
   Cloudflare account, the DNS record and the TLS certificate are created for you.
6. Every `git push` to `main` redeploys automatically.

HTTPS matters here: WebRTC and the clipboard API only work on secure origins, and Pages gives
you a certificate by default.

<details>
<summary>Other hosts</summary>

| Host | What to do |
|---|---|
| GitHub Pages | Settings → Pages → Deploy from branch → `main` / root |
| Netlify | Drag the folder in, or connect the repo — no build command |
| Vercel | Import the repo, framework preset "Other" |
| Any web server | Copy `index.html` into the web root |

</details>

---

## How it works

```
     textarea  ──input──▶  diff  ──▶  Y.Text (CRDT)  ──▶  y-webrtc  ──▶  peers
        ▲                                   │                              │
        └──────────── remote delta ◀────────┴──────── awareness ◀──────────┘
                                              (name, colour, cursor)
```

- **[Yjs](https://github.com/yjs/yjs)** holds the document as a CRDT, so concurrent edits merge
  deterministically instead of clobbering each other. Every keystroke is diffed against the
  shared state and sent as a tiny insert/delete operation.
- **[y-webrtc](https://github.com/yjs/y-webrtc)** connects the browsers directly. A signaling
  server is used **only** to introduce peers to each other — the document never passes through
  it, and traffic between peers is encrypted with the room code as the shared secret.
- **Awareness** carries the ephemeral state: display name, colour, and cursor/selection offsets.
  Offsets are transformed through incoming deltas, so remote carets stay put while you type.
- The editor is a transparent `<textarea>` sitting exactly on top of a highlighted `<pre>`,
  plus a cursor layer and a gutter. All three are moved together on scroll.

Two gotchas that are already handled, in case you fork this:

1. `code { font-family: monospace }` in the browser's default stylesheet overrides inheritance,
   so the highlight layer must re-declare `font: inherit` or it drifts ~1px per character away
   from the textarea.
2. Character width must be measured with a probe **inside** the highlight layer, not on
   `document.body`, or remote cursors land in the wrong column.

---

## Rooms & privacy

- Codes are 8 characters from a 32-symbol alphabet with look-alikes removed — about
  1.1 trillion combinations, generated with `crypto.getRandomValues`.
- The code is the password: it is used to encrypt peer traffic, and it stays in the URL hash,
  which browsers never send to a server.
- Nothing is persisted anywhere. When the last person closes the tab, the document is gone —
  so download it if you want to keep it.
- Only your display name and signaling preference are stored, in `localStorage`, on your device.

---

## Networking notes

Default signaling servers are the public Yjs ones:

```
wss://y-webrtc-eu.fly.dev
wss://signaling.yjs.dev
```

You can replace them in **Settings → Signaling servers** (one URL per line). To run your own:

```bash
npm i y-webrtc
PORT=4444 node ./node_modules/y-webrtc/bin/server.js
# then use ws://localhost:4444 (or wss://... behind TLS)
```

Strict corporate or campus networks sometimes block direct peer connections. WebRTC then needs
a TURN relay; add one in the `WebrtcProvider` options via `peerOpts.config.iceServers` if you
hit that. If the sync engine can't load at all, the app says so in a banner and keeps working
as a local editor.

---

## Repo layout

```
index.html   the entire application — markup, styles, editor, sync, highlighter
README.md    this file
LICENSE      MIT
```

No dependencies are vendored; Yjs and y-webrtc are pulled from esm.sh through an import map,
which means the first load needs internet access even though the sharing itself is peer-to-peer.

## Browser support

Chrome, Edge, Firefox, Safari 16.4+, and mobile equivalents. Requires HTTPS (or localhost).

## License

MIT — see [LICENSE](LICENSE).
