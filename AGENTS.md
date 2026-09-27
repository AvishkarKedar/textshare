<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# anonshare Agent Operating Instructions & Invariants

## MANDATORY: Continuous Documentation Synchronization
Whenever you make any change to this repository, you **MUST** synchronize the corresponding documentation file as defined in [COMMANDS.md](COMMANDS.md):
- **Features / Product Requirements / Personas** → Update [`PRD.md`](PRD.md)
- **Architecture / Protocols / Data Flows / APIs** → Update [`Architecture.md`](Architecture.md)
- **Rules / Invariants / Anti-Patterns / Security** → Update [`rules.md`](rules.md)
- **UI / Styling / Themes / Components / Mobile** → Update [`design.md`](design.md)
- **Tasks / Roadmap / Bug Fixes / Changelogs** → Update [`tasks.md`](tasks.md)
- **Incidents / Debugging / Post-Mortems / Lessons** → Update [`memory.md`](memory.md)

## Current System Snapshot (2026-09-27, M-22)
- **Version**: 5.5.1 (`package.json`, landing UI, `/api/status` in sync).
- **Production endpoints**: `code.avishkark.in` (CF Pages, static export + `functions/api/*`) · `relay.avishkark.in` (VPS Node relay, bwrap-hardened runner) · `textshare-sync.avishkarkedar.workers.dev` (backup CF Worker relay) · `admincode.avishkark.in` (admin panel). All four verified live; relay runner confirmed working for python/js/bash (real exit codes, ms-level timings).
- **UI De-Jargon & Cleanup (M-22)**: 48 unused `shadcn/ui` components and dead `Testimonials.tsx` removed; technical crypto jargon removed from Hero, StatsStrip, RoomEntryDialog, and FilesDrawer (retained in FAQ / Security modals); TopBar touch target height raised to `h-8 sm:h-7` with larger invite button; footer converted to 3 columns; supported language count aligned to 8.
- **Failover (live-verified M-20)**: client walks relay candidates automatically (`relayCandidates()` in `src/lib/relay.ts`); rooms self-heal with `create=1` re-connects; Worker WS 101 responses pass through `applyCors` untouched. Verified end-to-end: killing the home relay mid-session keeps the room + local doc, switches both peers to the backup Worker in <7s, restores `synced`, and post-failover edits propagate.
- **Ownerless-room promotion (M-21, live-verified)**: if a joiner's self-heal re-creates a room before the owner returns (failover race), the owner's `create=1&o=<token>` reconnect — gated by valid room auth (`a=<auth>` must hash-match) — claims/updates ownership on BOTH `relay/server.js` and `worker/src/index.js` (Worker persists the claim). `/room/:code/exists` now reports `ownerless`; the owner client auto-sends the claim when it sees that flag. First-claim-wins; wrong-auth claims are rejected at the socket.
- **Remote selection sharing (M-21)**: live selection ranges (`from,to` + fileId) broadcast inside the awareness `user.sel` field (throttled 200 ms, E2EE); receivers render them as tinted overlays in each peer's color. Ranges are re-anchored as Yjs relative positions on arrival so concurrent edits shift the highlight instead of desyncing it.
- **Admin auth**: `ADMIN_PASSWORD` secret on each relay (fail-closed; NO hardcoded fallback); 12h HMAC bearer tokens.
- **Mobile**: Run is a TopBar button only (fixed Run FAB removed in M-20). Symbol-key accessory bar is collapsible (M-21): chevron hides the 40px bar, editor gains the height back, a pill above the nav re-opens it; `mbarCollapsed` is session state in the store. Command palette, chat drawer, files drawer, symbol keys, and bottom nav verified working at 320–390px with zero console errors.
- **Dev quirk (fixed)**: `next dev` via 127.0.0.1 needs `allowedDevOrigins: ["localhost", "127.0.0.1"]` (Next 16 blocks its own dev chunks otherwise → page renders but never hydrates, zero console errors).
- **Test suite**: `npm test` → vitest, **20/20 passing** (tests/app-core.test.ts + tests/relay-crypto.test.ts).

## Critical Engineering Invariants:
1. **CSP React Hydration**: NEVER remove `'unsafe-inline'` from `public/_headers`. Next.js static exports require `'unsafe-inline'` for React hydration scripts (`self.__next_f.push`).
2. **Zero Mock / Fake Data**: Never use `Math.random()` in audio meters, speaking avatars, or peer states.
3. **Author Integrity**: Author is Avishkar Kedar ([https://avishkark.in](https://avishkark.in) · `avishkarkedar+text@gmail.com`). License is MIT.
4. **Static Export Routing**: All dynamic API functions must live in `functions/api/*.ts`, NEVER in `src/app/api/`.
5. **Strict TypeScript & Testing**: Code must pass `npx tsc --noEmit` and `npm test` (20/20 passing) before every deployment.
6. **Yjs Session Routing**: ANY change to the `files` array (add/remove/rename/insert, including generated-UI files) must go through the session API (`addYFile` / `removeYFile` / `updateYFile`) when a session is active — plain `setState` gets rolled back by `mirrorFiles()` and never reaches peers.
