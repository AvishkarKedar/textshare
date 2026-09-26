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

## Current System Snapshot (2026-09-27, audit round 2)
- **Version**: 5.5.0 (`package.json`, landing UI, `/api/status` in sync).
- **Production endpoints**: `code.avishkark.in` (CF Pages, static export + `functions/api/*`) · `relay.avishkark.in` (VPS Node relay, bwrap-hardened runner) · `textshare-sync.avishkarkedar.workers.dev` (backup CF Worker relay) · `admincode.avishkark.in` (admin panel). All four verified live; relay runner confirmed working for python/js/bash (real exit codes, ms-level timings).
- **Failover (live-verified M-20)**: client walks relay candidates automatically (`relayCandidates()` in `src/lib/relay.ts`); rooms self-heal with `create=1` re-connects; Worker WS 101 responses pass through `applyCors` untouched. Verified end-to-end: killing the home relay mid-session keeps the room + local doc, switches both peers to the backup Worker in <7s, restores `synced`, and post-failover edits propagate. Known race: a joiner's self-heal can land before the owner's, leaving the failover room ownerless (`no_owner` on admin delete) — it still TTL-expires; relay-side owner upgrade would close this.
- **Admin auth**: `ADMIN_PASSWORD` secret on each relay (fail-closed; NO hardcoded fallback); 12h HMAC bearer tokens.
- **Mobile**: Run is a TopBar button only (fixed Run FAB removed in M-20 — it covered editor content and duplicated the control). Command palette, chat drawer, files drawer, symbol keys, and bottom nav verified working at 320–390px with zero console errors.
- **Dev quirk (fixed)**: `next dev` via 127.0.0.1 needs `allowedDevOrigins: ["localhost", "127.0.0.1"]` (Next 16 blocks its own dev chunks otherwise → page renders but never hydrates, zero console errors).
- **Test suite**: `npm test` → vitest, **20/20 passing** (tests/app-core.test.ts + tests/relay-crypto.test.ts).

## Critical Engineering Invariants:
1. **CSP React Hydration**: NEVER remove `'unsafe-inline'` from `public/_headers`. Next.js static exports require `'unsafe-inline'` for React hydration scripts (`self.__next_f.push`).
2. **Zero Mock / Fake Data**: Never use `Math.random()` in audio meters, speaking avatars, or peer states.
3. **Author Integrity**: Author is Avishkar Kedar ([https://avishkark.in](https://avishkark.in) · `avishkarkedar+text@gmail.com`). License is MIT.
4. **Static Export Routing**: All dynamic API functions must live in `functions/api/*.ts`, NEVER in `src/app/api/`.
5. **Strict TypeScript & Testing**: Code must pass `npx tsc --noEmit` and `npm test` (20/20 passing) before every deployment.
6. **Yjs Session Routing**: ANY change to the `files` array (add/remove/rename/insert, including generated-UI files) must go through the session API (`addYFile` / `removeYFile` / `updateYFile`) when a session is active — plain `setState` gets rolled back by `mirrorFiles()` and never reaches peers.
