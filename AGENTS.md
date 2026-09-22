<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# anonshare Agent Operating Instructions & Invariants

## MANDATORY: Continuous Documentation Synchronization
Whenever you make any change to this repository, you **MUST** synchronize the corresponding documentation file as defined in [COMMANDS.md](file:///c:/Users/Dell/Desktop/textshare/COMMANDS.md):
- **Features / Product Requirements / Personas** $\longrightarrow$ Update [`PRD.md`](file:///c:/Users/Dell/Desktop/textshare/PRD.md)
- **Architecture / Protocols / Data Flows / APIs** $\longrightarrow$ Update [`Architecture.md`](file:///c:/Users/Dell/Desktop/textshare/Architecture.md)
- **Rules / Invariants / Anti-Patterns / Security** $\longrightarrow$ Update [`rules.md`](file:///c:/Users/Dell/Desktop/textshare/rules.md)
- **UI / Styling / Themes / Components / Mobile** $\longrightarrow$ Update [`design.md`](file:///c:/Users/Dell/Desktop/textshare/design.md)
- **Tasks / Roadmap / Bug Fixes / Changelogs** $\longrightarrow$ Update [`tasks.md`](file:///c:/Users/Dell/Desktop/textshare/tasks.md)
- **Incidents / Debugging / Post-Mortems / Lessons** $\longrightarrow$ Update [`memory.md`](file:///c:/Users/Dell/Desktop/textshare/memory.md)

## Critical Engineering Invariants:
1. **CSP React Hydration**: NEVER remove `'unsafe-inline'` from `public/_headers`. Next.js static exports require `'unsafe-inline'` for React hydration scripts (`self.__next_f.push`).
2. **Zero Mock / Fake Data**: Never use `Math.random()` in audio meters, speaking avatars, or peer states.
3. **Author Integrity**: Author is Avishkar Kedar ([https://avishkark.in](https://avishkark.in) · `avishkarkedar+text@gmail.com`). License is MIT.
4. **Static Export Routing**: All dynamic API functions must live in `functions/api/*.ts`, NEVER in `src/app/api/`.
5. **Strict TypeScript & Testing**: Code must pass `npx tsc --noEmit` and `npm test` (62/62 passing) before every deployment.
