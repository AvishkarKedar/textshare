# anonshare — Product Requirements Document (PRD)

> **Document Version:** 5.3.0  
> **Status:** Active / Production Baseline  
> **Author:** Avishkar Kedar ([https://avishkark.in](https://avishkark.in) · `avishkarkedar+text@gmail.com`)  
> **Production URL:** [https://code.avishkark.in](https://code.avishkark.in)  
> **License:** MIT  

---

## 1. Executive Summary & Vision

**anonshare** is an ultra-fast, zero-knowledge, end-to-end encrypted (E2EE) collaborative scratchpad and pair programming IDE. It enables developers, interviewers, educators, and teams to open a room in seconds with a 6-character code, invite others without registration, collaborate on code with live audio voice chat and multi-cursor sync, execute programs safely in a sandbox, and leave zero digital footprint when done.

### Core Mantras
1. **Zero Registration / Zero Logs**: No email, no accounts, no cookies, no tracking pixels, no advertising beacons.
2. **True End-to-End Encryption**: Text, code, files, and voice signaling are encrypted client-side using browser-native WebCrypto AES-GCM before transmitting over the wire. The server relay only ever forwards opaque ciphertext.
3. **Strict Ephemerality**: Rooms, snapshots, chats, and shared files exist only while participants are present. When the last participant disconnects, a countdown timer permanently wipes all data from memory and storage.
4. **Tactile Craftsmanship**: Dense, high-contrast monospace UI, keyboard-first command palette, responsive mobile design, sub-50ms sync latency, and zero fake/mock metrics.

---

## 2. Real Project & Author Details (Strict Invariant)

To maintain absolute credibility and legal compliance, the project strictly uses genuine author details across all surfaces:
- **Product Name**: `anonshare` (Repository & relay Worker identifier: `textshare`)
- **Author & Maintainer**: **Avishkar Kedar**
- **Personal Website**: [https://avishkark.in](https://avishkark.in)
- **Contact Email**: [avishkarkedar+text@gmail.com](mailto:avishkarkedar+text@gmail.com)
- **Source Repository**: [https://github.com/AvishkarKedar/textshare](https://github.com/AvishkarKedar/textshare)
- **License**: MIT License ([LICENSE](file:///c:/Users/Dell/Desktop/textshare/LICENSE))
- **Deployment Platform**: Cloudflare Pages (`dist/` static export) + Cloudflare Workers / Oracle VPS Relay.

---

## 3. User Personas & Core Use Cases

### Persona A: Pair Programmers & Interviewers
- **Need**: Instant shared editor with zero friction, multi-language syntax highlighting, run code with stdin/stdout, and low-latency voice communication.
- **Workflow**: Create room $\rightarrow$ copy invite link $\rightarrow$ both join voice $\rightarrow$ write code $\rightarrow$ run in terminal $\rightarrow$ close tab.

### Persona B: Security-Conscious Teams & Privacy Advocates
- **Need**: Share sensitive config files, API keys, architecture notes, or passwords across teams without leaving persistent logs on company servers.
- **Workflow**: Enter room password $\rightarrow$ PBKDF2 dual-salt keys derived $\rightarrow$ share text/files $\rightarrow$ room self-destructs after 10m TTL.

### Persona C: Students & Educators
- **Need**: Collaborate on assignments, review code diffs with Time Machine, run automated test assertions (`/test`), preview HTML/Markdown/Docs, and study offline.

---

## 4. Comprehensive Feature Specifications

### 4.1 Room Lifecycle & Cryptographic Auth
- **Room Code**: 6 alphanumeric uppercase characters (e.g. `ABC123`).
- **Collision Resistance**: Creating a room issues `?create=1&excl=1`. If the code exists, relay responds with `409 Conflict`, prompting the client to roll another code.
- **Cryptographic Key Derivation**:
  - Algorithm: PBKDF2-SHA256 with 600,000 iterations.
  - Encryption Key: `PBKDF2(code + ":" + password, salt = "textshare|CODE")` $\rightarrow$ AES-GCM 256. (Stored only in browser memory, never sent to server).
  - Auth Token: `PBKDF2(code + ":" + password, salt = "textshare-auth|CODE")` $\rightarrow$ 32 bytes hex. (Sent to server to authenticate room membership; server only stores `SHA-256(auth)`).
- **TTL Options**:
  - `10m` (Default) — room destroyed 10 minutes after last client leaves.
  - `1h` — 1 hour grace period.
  - `24h` — 24 hours grace period for longer workshops.
- **Room Controls**:
  - **Lock / Password**: Protect room with user password.
  - **Read-Only Toggle**: Owner can restrict edit permissions.
  - **Suspend / Destroy**: Owner can immediately kill the room and purge memory.

---

### 4.2 Multi-File Editor & Language Engine
- **Tabs System**: Create, rename, switch, and close multiple files (`TabBar.tsx`).
- **Syntax Highlighting**: Real-time tokenization for 15+ languages: JavaScript, TypeScript, Python, HTML, CSS, JSON, Rust, Go, C, C++, Java, SQL, Markdown, YAML, Shell.
- **Auto Language Detection**: Automatically parses pasted code structures (e.g., `def `, `import React`, `fn main()`, `public static void`) and selects the appropriate language mode.
- **Editor Tooling**:
  - Search & Replace bar (`⌘F`, `⌘⌥F`) with regex and case sensitivity.
  - Scoped undo/redo stack.
  - Line numbers, cursor position counter, character count, and indentation controls (Tabs vs Spaces).

---

### 4.3 Real-Time WebRTC Voice Mesh
- **Architecture**: Peer-to-peer WebRTC DTLS-SRTP mesh with polite peer negotiation (glare collision handling).
- **Asymmetric / Listener Mode**: Participants without microphone hardware or mic permissions automatically receive remote audio and listen without erroring.
- **Web Audio Analyzer**: Real-time `AnalyserNode` monitoring calculates local & remote audio levels (0–100%) and drives Voice Activity Detection (VAD) for speaking avatars.
- **Hardware Controls**:
  - Hardware Mute (`toggleMute`) — cuts audio track stream.
  - Hardware Deafen (`toggleDeafen`) — mutes all incoming audio output elements.
  - Push-to-Talk (`setPushToTalk`) — hold key/button to transmit.
- **Autoplay Recovery**: Automatically unlocks audio context on first touch/click interaction if browser blocks autoplay.

---

### 4.4 Sandboxed Code Runner (`/run` & Terminal Panel)
- **Supported Environments**: Python 3.11, Node.js 22, C (gcc), C++ (g++), Rust, Go, Java, Bash.
- **Execution Pipeline**:
  - Local/Pages calls `/api/run` (Cloudflare Pages Function) $\rightarrow$ proxies to Oracle VPS Bubblewrap sandbox (`relay.avishkark.in`).
  - Limits: 5000ms CPU execution timeout, 128MB RAM limit, no root access, isolated `/tmp`.
- **Interactive Terminal**:
  - Displays color-coded stdout, stderr, exit code, and execution duration in ms.
  - Allows stdin inputs sent directly to running processes.

---

### 4.5 Modals, Drawers & Overlays
1. **Command Palette (`⌘K`)**: Fast fuzzy finder for 24+ actions, themes, and modals.
2. **Time Machine / History (`⌘⇧H`)**: Visual scrub slider across document revision snapshots with side-by-side Diff Viewer, "Revert to here", and "Save as tab".
3. **Files Drawer (`⌘B`)**: Client-encrypted file sharing up to 50MB with instant preview (images, markdown, pdf, docx, code) and download.
4. **Bookmarks & Recent Rooms (`⌘⇧R`)**: LocalStorage history of visited rooms with lock badges and quick rejoin.
5. **Crypto Explainer (`⌘⇧K`)**: Interactive visual proof of PBKDF2 key derivation, salts, and AES-GCM cipher isolation.
6. **Threat Model & Security Modal (`⌘⇧X`)**: Full transparency on what anonshare protects against vs what is out of scope.
7. **System Status (`⌘⇧Y`)**: Real-time heartbeat of relay WebSocket, Pages Functions, latency, and memory footprint.
8. **FAQs & Help Modal (`⌘⇧F`)**: Searchable accordion across 6 categories (Security, Rooms, Voice, Runner, Storage, Privacy).
9. **Onboarding Tour (`⌘⇧O`)**: Step-by-step guided spotlight walkthrough for first-time visitors.
10. **Whiteboard (`⌘⇧W`)**: Collaborative canvas for system diagrams, freehand sketches, and architecture charts.

---

### 4.6 Slash Commands
Typing `/` in the editor triggers the slash menu:
- `/faq` — Open FAQ dialog
- `/run` — Execute current file
- `/test` — Run test runner suite
- `/voice` — Join voice mesh
- `/zen` — Toggle distraction-free Zen mode
- `/theme` — Cycle color themes
- `/crypto` — Open encryption breakdown
- `/clean` — Clear terminal logs

---

### 4.7 Inactivity Protection & Room Destruction
- **15-Minute Idle Detector**: Listens to keystrokes, mouse moves, and touch events.
- **5-Minute Countdown Warning**: Modal alerts user with countdown timer before room deletion. "Keep Working" button resets the countdown immediately.

---

## 5. Non-Functional & Security Requirements

| Metric | Target |
|---|---|
| First Contentful Paint (FCP) | $< 600\text{ ms}$ on 4G |
| Time to Interactive (TTI) | $< 900\text{ ms}$ |
| Relay WebSocket Round-Trip | $< 45\text{ ms}$ worldwide |
| End-to-End Encryption | AES-GCM 256-bit with PBKDF2 600,000 iterations |
| Server Knowledge | Zero document plaintext, zero voice audio, zero file content |
| Browser Compatibility | Chrome/Chromium 90+, Firefox 90+, Safari 15+, Edge 90+, Android Chrome, iOS Safari |
