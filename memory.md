# anonshare — Project Memory & Incident Learnings

> **Document Purpose:** Long-term institutional memory, historical debugging breakthroughs, and critical lessons learned to ensure no future developer or AI agent regresses the codebase.

---

## 1. Key Incident History & Debugging Breakthroughs

### Incident 1: The CSP React Hydration Blockade (September 2026)
- **Symptom**: All buttons ("Create room", FAQ accordion, modal triggers) on the live production site `https://code.avishkark.in` were completely unresponsive. The page rendered statically, but zero click events fired. There were **0 console errors** in browser devtools.
- **Investigation**:
  1. Inspecting DOM elements revealed that React fibers (`__reactFiber$`) were completely absent from all DOM nodes.
  2. `window.next` existed, but `self.__next_f` was empty.
  3. Inspecting `SecurityPolicyViolation` events revealed that the browser silently blocked two inline `<script>` tags containing the React hydration payload.
  4. The site had migrated from vanilla JS to Next.js 16 static export (`output: "export"`). The old `public/_headers` file still had:
     ```http
     Content-Security-Policy: ... script-src 'self' https://static.cloudflareinsights.com; ...
     ```
- **Fix**: Added `'unsafe-inline'` to `script-src` and `style-src` in `public/_headers`.
- **Golden Rule**: **NEVER remove `'unsafe-inline'` from `public/_headers` on static Next.js exports.**

---

### Incident 2: The Missing WebRTC Voice Mesh Implementation
- **Symptom**: The Voice Mesh panel only toggled a local boolean and generated random numbers (`Math.random()`) for microphone levels and speaking avatars. No WebRTC peer connections or real audio streams were established.
- **Root Cause**: During the initial Next.js migration, `lib/voice.js` was left behind and replaced by a mock UI placeholder. Additionally, the sync socket pointed to a relative path `/?XTransformPort=3003` which Cloudflare Pages could not upgrade to WebSockets.
- **Fix**:
  1. Ported the full WebRTC engine to `src/lib/voice.ts` with polite peer negotiation (glare collision resolution), always-listen receiver mode, and Web Audio `AnalyserNode` monitoring for real 0–100% microphone levels.
  2. Updated `src/lib/use-sync.ts` and `mini-services/anonshare-sync/index.ts` to route signaling (`voice-signal`) and speaking states (`voice-state`).
  3. Pointed sync sockets to `https://relay.avishkark.in` with WebSocket and polling transport fallbacks.

---

### Incident 3: Static Export vs App Router API Routes
- **Symptom**: Running `next build` failed with `Error: Export encountered errors on following paths: /api/run`.
- **Root Cause**: Next.js App Router does not allow dynamic server route handlers (`export async function POST()`) when `output: "export"` is enabled in `next.config.ts`.
- **Fix**: All serverless backend logic runs as Cloudflare Pages Functions in `functions/api/` (`run.ts`, `crypto.ts`, `status.ts`, `generate.ts`), leaving `src/app/` 100% static.

---

### Incident 4: TypeScript Build Error Silencing
- **Symptom**: `next.config.ts` had `typescript.ignoreBuildErrors: true`, hiding genuine typing errors in `CryptoModal`, `SecurityModal`, `StatusModal`, `store.ts`, and `VoicePanel`.
- **Fix**: Explicitly fixed all component prop interfaces, typed `TerminalLine[]`, added `muted`/`deafened` to `Participant`, cast zip array buffers properly, and removed `ignoreBuildErrors`. `npx tsc --noEmit` now passes with 0 errors.

---

## 2. Environment & Configuration Reference

| Parameter | Production Value | Development Value |
|---|---|---|
| **Live URL** | `https://code.avishkark.in` | `http://localhost:3000` |
| **Relay Host** | `https://relay.avishkark.in` | `http://localhost:3003` |
| **Sync Protocol** | Socket.io + WebSockets (transports: websocket, polling) | Socket.io (port 3003) |
| **Author** | Avishkar Kedar | Avishkar Kedar |
| **Author URL** | `https://avishkark.in` | `https://avishkark.in` |
| **Author Email** | `avishkarkedar+text@gmail.com` | `avishkarkedar+text@gmail.com` |
| **Cloudflare Pages Project** | `textshare` | `textshare` |
| **Build Directory** | `dist/` | `.next/` |

---

## 3. Standard Operating Commands

```bash
# 1. Run full unit test suite (56 tests)
npm test

# 2. Run strict TypeScript compiler verification
npx tsc --noEmit

# 3. Build production static export
npm run build

# 4. Deploy static export to Cloudflare Pages
npx wrangler pages deploy dist --project-name textshare --branch main

# 5. Check live deployment headers
curl -I https://code.avishkark.in
```
