# anonshare — Engineering Tasks & Roadmap

> **Engineering Status:** Master Baseline Active & Deployed  
> **Production Target:** [https://code.avishkark.in](https://code.avishkark.in)  
> **Automated Test Suite:** 17/17 Passing Tests (`vitest run`)  
> **Compiler Diagnostics:** 0 TypeScript Errors (`npx tsc --noEmit`)  

---

## 1. Exhaustive Milestone Audit & Completed Changelog

```
+---------------------------------------------------------------------------------------------------------------+
|                                            Completed Milestones Matrix                                        |
+---------------+-------------------+---------------------------------------------+-----------------------------+
| Milestone ID  | Subsystem         | Technical Scope & Implementation Details    | Associated Files            |
+---------------+-------------------+---------------------------------------------+-----------------------------+
| M-01          | Framework Upgrade | Migrated to Next.js 16 with Turbopack static| src/app/*, next.config.ts,  |
|               | & State Store     | export (output: "export"). Zustand 5 store. | src/lib/store.ts            |
+---------------+-------------------+---------------------------------------------+-----------------------------+
| M-02          | Edge APIs         | Built serverless Cloudflare Pages Functions | functions/api/run.ts,       |
|               | & Sandboxing      | for code execution, crypto, status, gen.    | functions/api/crypto.ts     |
+---------------+-------------------+---------------------------------------------+-----------------------------+
| M-03          | CSP Hydration     | Diagnosed & resolved dead button bug caused | public/_headers,            |
|               | Unblock           | by CSP blocking Next.js inline scripts.     | dist/_headers               |
+---------------+-------------------+---------------------------------------------+-----------------------------+
| M-04          | Signaling Relay   | Integrated Socket.io sync & awareness       | src/lib/use-sync.ts,        |
|               | Integration       | routing on relay.avishkark.in (:3003).      | mini-services/anonshare-sync|
+---------------+-------------------+---------------------------------------------+-----------------------------+
| M-05          | Strict TypeScript | Fixed all type errors across modals & store.| tsconfig.json, store.ts,    |
|               | Compliance        | Enabled strict compilation (0 build errors).| CryptoModal, SecurityModal  |
+---------------+-------------------+---------------------------------------------+-----------------------------+
| M-06          | Mobile & Touch UI | Added touch button visibility classes       | TabBar.tsx, FilesDrawer.tsx,|
|               | Accessibility     | (opacity-100 sm:opacity-0 sm:group-hover).  | src/components/editor/*     |
+---------------+-------------------+---------------------------------------------+-----------------------------+
| M-07          | Author & Branding | Set genuine author credentials & MIT license| README.md, layout.tsx,      |
|               | Integrity         | across footers, legal dialogs, and metadata.| Hero.tsx, LandingFooter.tsx |
+---------------+-------------------+---------------------------------------------+-----------------------------+
| M-08          | VPS Relay Sandbox | Hardened bubblewrap runner (nproc 512, fsize| relay/server.js,            |
|               | & Full Compilers  | 100MB), rotated secret, 8/8 languages pass. | scripts/*, ecosystem config |
+---------------+-------------------+---------------------------------------------+-----------------------------+
| M-09          | HTML & Web Live   | Added sandboxed iframe preview with device  | MarkdownPreview.tsx,        |
|               | Preview Runner    | modes (desktop/tablet/mobile), console logs.| store.ts, TabBar.tsx        |
+---------------+-------------------+---------------------------------------------+-----------------------------+
| M-10          | Program Input     | CRLF to LF normalization, trailing newline  | relay/server.js,            |
|               | & EPIPE Resiliency| auto-append, proc.stdin error handling.     | scripts/runner-matrix.mjs   |
+---------------+-------------------+---------------------------------------------+-----------------------------+
| M-11          | Landing Redesign  | Tokenized theme palette, interactive Demo   | src/components/landing/*,   |
|               | & Contrast Pass   | card tokenizer, FOUC theme pre-paint guard. | FaqModal.tsx, globals.css   |
+---------------+-------------------+---------------------------------------------+-----------------------------+
| M-12          | SSR Hydration Fix | Mount-gated Reveal animations to prevent    | src/components/landing/     |
|               | & Reduced Motion  | useReducedMotion SSR markup divergence.     | Reveal.tsx                  |
+---------------+-------------------+---------------------------------------------+-----------------------------+
| M-13          | Legal & Privacy   | 13-section GDPR/CCPA Privacy Policy and     | src/components/palette/     |
|               | Modernization     | Terms of Service in-app modals.             | PrivacyTermsModals.tsx      |
+---------------+-------------------+---------------------------------------------+-----------------------------+
| M-14          | v5.4 Editor Focus | Removed legacy Vite files & experimental    | package.json, sw.js,        |
|               | & Cache Hardening | dead features, upgraded SW cache to v23.    | tests/*                     |
+---------------+-------------------+---------------------------------------------+-----------------------------+
```

---

## 2. Detailed Subsystem Task Verification Status

### 2.1 Editor & Collaboration Subsystem
- [x] **Multi-File Tab Bar ([`TabBar.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/editor/TabBar.tsx))**:
  - [x] File addition, deletion, and active tab switching.
  - [x] Tab close buttons (`X`) rendered for multiple files.
  - [x] Local export to ZIP via `buildZip()` without server dependency.
- [x] **Syntax Engine ([`highlight.ts`](file:///c:/Users/Dell/Desktop/textshare/src/lib/highlight.ts))**:
  - [x] Real-time tokenization for 15+ languages.
  - [x] Paste auto-detection heuristics for Python, Rust, TS, Go, C++, SQL.
- [x] **Time Machine History ([`HistoryDrawer.tsx`](file:///c:/Users/Dell/Desktop/textshare/src/components/palette/HistoryDrawer.tsx))**:
  - [x] Snapshot scrubbing slider with side-by-side diffing.
  - [x] Direct "Revert to here" state restoration.
  - [x] "Save as tab" snapshot branching.


### 2.3 Cloudflare Edge & Serverless Functions
- [x] **Pages Functions Routing (`functions/api/`)**:
  - [x] `/api/run` — Proxy to Oracle VPS Bubblewrap sandbox.
  - [x] `/api/crypto` — PBKDF2 derivation benchmarking.
  - [x] `/api/status` — Real-time health diagnostic metrics.
  - [x] `/api/generate` — Template fallback provider.
- [x] **Security Headers ([`public/_headers`](file:///c:/Users/Dell/Desktop/textshare/public/_headers))**:
  - [x] Strict CSP with `'unsafe-inline'` for React hydration.
  - [x] Static immutable caching for `/_next/static/*`.

---

## 3. Active Quality Assurance & Compatibility Matrix

```
+-----------------------------------------------------------------------------------------------+
|                               Browser & Platform Support Matrix                               |
+---------------------+-------------------+-------------------+---------------------------------+
| Browser / Platform  | Status            | Audio WebRTC      | React Hydration Verification    |
+---------------------+-------------------+-------------------+---------------------------------+
| Google Chrome (120+)| Fully Verified    | DTLS-SRTP P2P     | Verified (__reactFiber$ present)|
| Mozilla Firefox     | Fully Verified    | DTLS-SRTP P2P     | Verified (__reactFiber$ present)|
| Apple Safari (macOS)| Fully Verified    | DTLS-SRTP P2P     | Verified (__reactFiber$ present)|
| Android Chrome      | Fully Verified    | Web Audio VAD     | Verified (Touch #mbar active)   |
| iOS Safari (15+)    | Fully Verified    | Autoplay Handled  | Verified (Touch #mbar active)   |
| Headless Puppeteer  | Fully Verified    | Fake Mic Streams  | Verified (58/58 tests passing)  |
+---------------------+-------------------+-------------------+---------------------------------+
```

---

## 4. Future Engineering Roadmap

### 4.1 Infrastructure & Connectivity (VPS)
- [ ] **Coturn TURN Server Deployment**: Set up coturn on Oracle VPS to support peer audio traversal across strict corporate symmetric NAT firewalls.
- [ ] **Direct WebSocket Compression**: Enable `permessage-deflate` on VPS WebSocket relay.

### 4.2 Extended Features
- [ ] **AI Pair Programmer (`/ai`)**: Introduce optional client-side API key configuration for LLM inline code completion.
- [ ] **Additional Compilers**: Expand `/api/run` sandbox to support Zig, Kotlin, Swift, and PHP.

---

## 5. Production Release & Deployment Runbook

Follow these exact steps for every production deployment:

```bash
# Step 1: Run static type check
npx tsc --noEmit

# Step 2: Run full automated test suite
npm test

# Step 3: Build static production export
npm run build

# Step 4: Verify _headers copied to dist/
grep "unsafe-inline" dist/_headers

# Step 5: Check git status
git status

# Step 6: Commit and push changes
git add .
git commit -m "feat/fix: description of changes"
git push origin main

# Step 7: Deploy static export to Cloudflare Pages
npx wrangler pages deploy dist --project-name textshare --branch main

# Step 8: Verify live production endpoint
curl -I https://code.avishkark.in
```
