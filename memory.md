# anonshare — Institutional Memory & Incident Knowledge Base

> **Document Purpose:** Long-Term Engineering Memory, Root-Cause Incident Analysis, and Architectural Invariant Rationale  
> **Audience:** Core Maintainers and Autonomous Coding Agents  
> **Production URL:** [https://code.avishkark.in](https://code.avishkark.in)  

---

## 1. Comprehensive Incident Post-Mortem Log

```
+-----------------------------------------------------------------------------------------------------------------------+
|                                          Major Production Incident Log                                                |
+---------------+-------------------------+---------------------------------------------+-------------------------------+
| Incident ID   | Title                   | Root Cause                                  | Resolution                    |
+---------------+-------------------------+---------------------------------------------+-------------------------------+
| INC-2026-09A  | The CSP React Hydration | CSP in public/_headers lacked               | Added 'unsafe-inline' to      |
|               | Blockade                | 'unsafe-inline' in script-src for Next.js   | script-src and style-src.     |
+---------------+-------------------------+---------------------------------------------+-------------------------------+
| INC-2026-09B  | The Missing WebRTC Mesh | lib/voice.js was omitted during Next.js     | Ported complete WebRTC mesh   |
|               | Implementation          | migration, leaving Math.random() mocks.     | to src/lib/voice.ts with VAD. |
+---------------+-------------------------+---------------------------------------------+-------------------------------+
| INC-2026-09C  | App Router Static Export| Placing server POST handlers in src/app/api/| Moved all dynamic APIs to     |
|               | Build Failures          | breaks Next.js static output: "export".     | functions/api/*.ts.           |
+---------------+-------------------------+---------------------------------------------+-------------------------------+
| INC-2026-09D  | TypeScript Error        | typescript.ignoreBuildErrors was true,      | Fixed all component prop      |
|               | Silencing               | hiding broken icon props and store types.   | types; enabled strict checks. |
+---------------+-------------------------+---------------------------------------------+-------------------------------+
| INC-2026-09E  | Bwrap Sandbox NPROC &   | RLIMIT_NPROC=32 blocked namespace clone     | Raised maxNproc to 512/256 &  |
|               | FSIZE Compiler Limits   | (EAGAIN); fsize=10MB killed Go/Rust linkers.| maxFsize to 100MB; 8/8 pass.  |
+---------------+-------------------------+---------------------------------------------+-------------------------------+
```

---

### Incident INC-2026-09A: The CSP React Hydration Blockade

#### 1. Symptoms & Initial Observations
- **Observed Failure**: When visiting `https://code.avishkark.in`, the landing page rendered HTML visually, but **every interactive button was completely unresponsive**:
  - Clicking "Create a room" did nothing.
  - Clicking FAQ accordion items did nothing.
  - Clicking theme toggles did nothing.
- **Console State**: Zero errors in browser Developer Tools. The page appeared completely "normal" in logs.

#### 2. Root Cause Analysis (Deep Dive)
- In Next.js 16 App Router with `output: "export"`, the build compiler generates two inline `<script>` tags inside `index.html`:
  1. `self.__next_f.push(...)` — hydration payloads for React components.
  2. Initial chunk bootstrap loaders.
- The project's inherited `public/_headers` file (written back when anonshare was a vanilla JS app) contained:
  ```http
  Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; ...
  ```
- Because `script-src` lacked `'unsafe-inline'`, the browser's CSP engine silently blocked the inline hydration scripts before execution.
- External JavaScript chunks loaded over the network, but React never hydrated the DOM. Inspecting DOM elements via Puppeteer revealed:
  - `reactKeys: []` — zero `__reactFiber$` keys attached to any DOM element.
  - `window.__next_f` was completely empty.
  - `securitypolicyviolation` event was triggered on inline script execution.

#### 3. Permanent Fix & Invariant
- Updated `public/_headers` with `'unsafe-inline'` in `script-src` and `style-src`.
- Tested the exact build locally with and without CSP headers:
  - Without CSP / With `'unsafe-inline'`: React hydrated instantly, `__reactFiber$` keys attached, buttons functioned 100%.
- **Invariant**: **NEVER remove `'unsafe-inline'` from `public/_headers` in static Next.js deployments.**

---

### Incident INC-2026-09B: The Missing WebRTC Voice Mesh *(historical — voice was later removed from the product in v5.4; kept for the engineering record)*

#### 1. Symptoms & Observations
- The Voice Mesh panel only toggled a local boolean state and displayed animated volume bars driven by `Math.random()`. No real WebRTC peer connections or audio streams were established between devices.
- Additionally, the sync socket pointed to `/?XTransformPort=3003` which Cloudflare Pages could not upgrade to WebSockets on production, causing infinite reconnect loops.

#### 2. Root Cause Analysis
- During the initial framework migration from vanilla JS to Next.js, the legacy `lib/voice.js` engine was left behind and replaced by a mock UI placeholder.
- Signaling events were not implemented on the sync relay server.

#### 3. Permanent Fix & Verification
- Created [`src/lib/voice.ts`](file:///c:/Users/Dell/Desktop/textshare/src/lib/voice.ts) with:
  - Polite peer negotiation algorithm resolving glare collisions.
  - Asymmetric listener-mode transceivers (`recvonly`).
  - Web Audio `AnalyserNode` monitoring with 0–100% volume calculation and VAD ($> 20$).
  - Autoplay recovery listeners.
- Updated `src/lib/use-sync.ts` and `mini-services/anonshare-sync/index.ts` to route `voice-signal` and `voice-state`.
- Verified end-to-end between two headless browser instances with synthetic microphone streams.

---

### Incident INC-2026-09C: App Router Static Export API Conflict

#### 1. Symptoms
- Running `next build` failed with:
  `Error: Export encountered errors on following paths: /api/run, /api/crypto, /api/status`

#### 2. Root Cause
- Next.js `output: "export"` statically renders all pages into HTML/CSS/JS. It does not support Node.js dynamic server endpoints (`export async function POST()`) inside `src/app/api/`.

#### 3. Permanent Fix
- Moved all serverless backend logic to Cloudflare Pages Functions under `functions/api/` (`run.ts`, `crypto.ts`, `status.ts`, `generate.ts`).
- `src/app/` remains 100% pure static React client code.

---

### Incident INC-2026-09D: TypeScript Build Error Masking

#### 1. Symptoms
- `next.config.ts` included `typescript: { ignoreBuildErrors: true }`, which allowed type errors to accumulate silently in production builds.

#### 2. Root Cause
- Mismatched interface typings in `CryptoModal` icon props (`style` property missing), `store.ts` (`ShortcutDef` group union missing `"tools"`, `TerminalLine[]` typing, `Blob` buffer casting), and `VoicePanel` (`muted`/`deafened` missing from `Participant`).

#### 3. Permanent Fix
- Resolved all TypeScript interface errors across all files.
- Removed `ignoreBuildErrors: true` from `next.config.ts`.
- Added `npx tsc --noEmit` as a required pre-commit check.

---

### Incident INC-2026-09E: Bwrap Sandbox NPROC & FSIZE Compiler Resource Blockades

#### 1. Symptoms & Initial Observations
- Running `node scripts/relay-version-discriminator.mjs` or `scripts/runner-matrix.mjs` against the live VPS relay yielded:
  - `bwrap: Creating new namespace failed: Resource temporarily unavailable` on Python, Node.js, Bash.
  - Go compiler output: `compile: writing output: write $WORK/b009/_pkg_.a: file too large`.
  - Rust linker output: `collect2: fatal error: ld terminated with signal 25 [File size limit exceeded]`.

#### 2. Root Cause Analysis
- **NPROC Accounting**: Linux kernel `RLIMIT_NPROC` applies to the *real UID* across the entire system. When the service runs under the `ubuntu` user (which already runs background systemd tasks and PM2), setting `--nproc=32` meant `clone()` failed immediately with `EAGAIN` because `ubuntu` already owned 38 system tasks.
- **FSIZE Compiler Overhead**: `--fsize=10485760` (10 MB) was lower than intermediate objects produced during standard library linking:
  - Go's `_pkg_.a` runtime is ~16–20 MB.
  - Rust's `rustc`/`ld` static binary intermediate during `-O` compilation exceeds 15 MB before dead-code elimination (`--gc-sections`).

#### 3. Permanent Fix & Invariant
- **`maxNproc`**: Configured to `512` (compile/JVM stages) and `256` (runtime stages).
- **`maxFsizeBytes`**: Configured to `100 MB` for compile/Go/Rust stages (`20 MB` for runtime scripts).
- **Environment Isolation**: Added explicit `--setenv HOME /tmp --setenv TMPDIR /tmp --setenv GOCACHE /tmp/gocache --setenv GOTMPDIR /tmp` inside bubblewrap namespaces.
- **Verification**: 8/8 languages (`python`, `javascript`, `bash`, `c`, `cpp`, `java`, `go`, `rust`) execute with 100% pass rate in production sandbox.

---

### Incident INC-2026-09F: Stdin Windows CRLF Line Endings & Unhandled EPIPE

#### 1. Symptoms & Initial Observations
- Python programs taking input (`int(input())`) crashed with `ValueError: invalid literal for int() with base 10: '42\r'`.
- Bash `read` scripts failed string comparisons due to attached `\r` carriage returns.
- Programs that exited early before consuming all stdin lines occasionally triggered unhandled `EPIPE` exceptions on Node.js child process streams.

#### 2. Root Cause Analysis
- Textareas on Windows / Android browsers emit `\r\n` (CRLF) line endings into the stdin buffer.
- Linux CLI runtimes inside `bwrap` retain `\r` when reading lines from standard input.
- Missing trailing newline caused `fgets`/`getline`/`Scanner` to block waiting for EOF.
- Node.js `proc.stdin.write()` throws `EPIPE` when the child process closes standard input early unless an error listener is attached.

#### 3. Permanent Fix & Invariant
- **Stdin Normalization**: Standard input is sanitized via `.replace(/\r\n/g, '\n').replace(/\r/g, '\n')` and guaranteed to terminate with `\n`.
- **EPIPE Resilience**: `proc.stdin.on('error', () => {})` is attached before writing input to spawned child processes.
- **Verification**: 16/16 test cases in `scripts/runner-matrix.mjs` pass across all 8 languages with multi-line CRLF stdin.

---

## 2. Technical Constants & Configuration Reference

```
+-----------------------------------------------------------------------------------------------+
|                                      System Constants Reference                               |
+-----------------------------+-----------------------------------+-----------------------------+
| Constant Name               | Exact Value                       | Operational Purpose         |
+-----------------------------+-----------------------------------+-----------------------------+
| PBKDF2 Iterations           | 600,000                           | Client-Side Key Derivation  |
| Document Encryption Salt    | "textshare|" + roomCode           | Dual-Salt Separation        |
| Relay Authentication Salt   | "textshare-auth|" + roomCode      | Dual-Salt Separation        |
| Cipher Algorithm            | AES-GCM 256-bit (96-bit IV)       | WebCrypto Document Cipher   |
| Max Binary Frame Size       | 524,288 Bytes (512 KB)            | WebSocket Frame Limit       |
| Max Snapshot Log Size       | 10,485,760 Bytes (10 MB)          | Compaction Threshold        |
| Inactivity Idle Timeout     | 15 Minutes (900,000 ms)           | Idle State Trigger          |
| Inactivity Warning Countdown| 5 Minutes (300,000 ms)            | Room Purge Countdown        |
| Voice VAD Power Threshold   | Average Amplitude > 20            | Speaking Avatar Glow        |
| Web Audio FFT Size          | 256 (128 Frequency Bins)          | AnalyserNode FFT Size       |
+-----------------------------+-----------------------------------+-----------------------------+
```

---

## 3. Autonomous Agent Troubleshooting Playbook

### Scenario A: Buttons or Modals Are Dead on Production
1. Open browser DevTools $\rightarrow$ Console. Check for `SecurityPolicyViolation` events.
2. In Elements tab, inspect any button: verify if `__reactFiber$...` property exists on the DOM node.
3. If `__reactFiber$` is absent, inspect response headers: `curl -I https://code.avishkark.in`.
4. Ensure `script-src` includes `'unsafe-inline'`. If missing, update `public/_headers` and redeploy.

### Scenario B: WebRTC Voice Connects but No Audio Is Heard
1. Check browser autoplay policy: Click anywhere on the window to trigger the audio unlock listener.
2. Verify mic permissions: Ensure browser allows microphone access on HTTPS.
3. Inspect signaling logs: Verify `voice-signal` frames (offer/answer/candidate) are exchanging over Socket.io.
4. Check NAT topology: If peers are behind strict symmetric NATs, coturn TURN server relay is required.

### Scenario C: Static Export Build Fails with Route Errors
1. Verify no dynamic API routes exist in `src/app/api/`.
2. Check `next.config.ts` has `output: "export"` and `distDir: "dist"`.
3. Verify all dynamic APIs reside in `functions/api/*.ts`.

