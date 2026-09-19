# anonshare — Engineering Tasks & Roadmap

> **Status:** Live & Production Ready  
> **Current Version:** 5.3.0  
> **Repository:** [https://github.com/AvishkarKedar/textshare](https://github.com/AvishkarKedar/textshare)  

---

## 1. Completed Milestones (Production Baseline)

- [x] **Next.js 16 & React 19 Architecture**
  - [x] Migrated codebase to Next.js 16 with Turbopack static export (`output: "export"`).
  - [x] Implemented Zustand 5 state management store with local persistence.
  - [x] Configured Tailwind CSS 4 with custom dark themes (Obsidian, Dracula, Nord, Amber, Paper).

- [x] **Cloudflare Pages & Edge Functions**
  - [x] Created serverless Cloudflare Pages Functions in `functions/api/`:
    - [x] `/api/run` — Compiler execution proxy.
    - [x] `/api/crypto` — PBKDF2 derivation benchmark helper.
    - [x] `/api/status` — Live health check & metrics.
    - [x] `/api/generate` — Generative UI template provider.
  - [x] Deployed automated builds to Cloudflare Pages (`textshare`).

- [x] **CSP React Hydration Fix**
  - [x] Diagnosed root cause of unresponsive buttons (CSP blocking inline Next.js hydration scripts).
  - [x] Configured `public/_headers` with `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com;`.
  - [x] Cleaned out obsolete cache paths (`/app.js`, `/app.css`) and added `/_next/static/*` immutable caching.

- [x] **Real WebRTC Voice Mesh Implementation**
  - [x] Created `src/lib/voice.ts` with polite peer negotiation (glare resolution) and always-listen receiver mode.
  - [x] Integrated Web Audio `AnalyserNode` frequency monitoring for real-time 0–100% mic levels and VAD.
  - [x] Removed all `Math.random()` placeholder code.
  - [x] Added signaling relay in `mini-services/anonshare-sync/index.ts` and `src/lib/use-sync.ts`.
  - [x] Wired hardware mute, hardware deafen, and push-to-talk in `VoicePanel.tsx`.

- [x] **Editor & Modal Tooling**
  - [x] Implemented multi-file tabs in `TabBar.tsx` with close button (`X`) support.
  - [x] Built Time Machine in `HistoryDrawer.tsx` with "Revert to here" and "Save as tab".
  - [x] Built interactive FAQ modal with real-time search across 6 categories.
  - [x] Added touch-friendly visibility (`opacity-100 sm:opacity-0 sm:group-hover:opacity-100`) for all drawer action buttons.
  - [x] Added safe fallback handlers in `EditorStage.tsx` to eliminate null pointer crashes.

- [x] **Strict TypeScript & Build Quality**
  - [x] Resolved all type errors across `CryptoModal`, `SecurityModal`, `StatusModal`, `store.ts`, `voice.ts`, and `VoicePanel`.
  - [x] Removed `ignoreBuildErrors: true` from `next.config.ts`.
  - [x] Verified `npx tsc --noEmit` exits with 0 errors.
  - [x] Verified all 56 Vitest unit and regression tests pass cleanly.

- [x] **Repo Hygiene & Assets**
  - [x] Added `/og.png` and `/icon-180.png` to `public/`.
  - [x] Untracked `db/custom.db` and `tool-results/` from git.
  - [x] Updated `.gitignore` and `README.md`.

---

## 2. Active Verification Tasks

- [ ] **End-to-End Live Verification**
  - [ ] Test room creation, URL copying, and peer joining on [https://code.avishkark.in](https://code.avishkark.in).
  - [ ] Verify live microphone audio between two distinct browsers/devices.
  - [ ] Verify code execution in terminal with Python, C++, and Node.js.
  - [ ] Verify FAQ modal search on mobile and desktop.

---

## 3. Future Roadmap & Enhancements

### 3.1 Relay & Infrastructure (VPS)
- [ ] **Coturn TURN Server Integration**: Install and configure `coturn` on Oracle VPS for peer audio traversal across strict corporate symmetric NATs / firewalls.
- [ ] **WebSocket Proxy Configuration**: Ensure Caddy / Cloudflare WebSocket proxy upgrades on `relay.avishkark.in` operate with zero connection drops.

### 3.2 Advanced Collaboration Features
- [ ] **Screen Sharing**: Add WebRTC `getDisplayMedia` screen sharing track alongside audio mesh.
- [ ] **Collaborative Whiteboard Sync**: Connect Whiteboard canvas path strokes to Yjs CRDT for live multiplayer drawing.
- [ ] **AI Pair Assistant**: Add inline LLM code completion and debugging suggestions triggered by `/ai`.
- [ ] **More Execution Runtimes**: Support Zig, Kotlin, Swift, and PHP in `/api/run`.

---

## 4. Release Checklist for Future Deployments

1. Run `npx tsc --noEmit` — verify 0 TypeScript errors.
2. Run `npm test` — verify 56/56 unit tests pass.
3. Run `npm run build` — verify Turbopack static compilation finishes cleanly.
4. Check `dist/_headers` — ensure `script-src` includes `'unsafe-inline'`.
5. Run `git status` — confirm no unwanted binary files or secrets are staged.
6. Push to `main`: `git push origin main`.
7. Deploy to Pages: `npx wrangler pages deploy dist --project-name textshare --branch main`.
8. Verify HTTP headers: `curl -I https://code.avishkark.in`.
