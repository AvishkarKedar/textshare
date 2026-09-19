# anonshare — Development & Agent Rules

> **Purpose:** Inviolable engineering rules, architectural invariants, and security constraints that all AI agents and human contributors **MUST ALWAYS FOLLOW WITHOUT EXCEPTION**.

---

## 1. Security & CSP Invariants

### 🚨 Rule 1: Never Break React Hydration in `public/_headers`
- **Context**: `anonshare` is a Next.js 16 static export (`output: "export"` in `next.config.ts`). Next.js static exports embed inline `<script>` tags in `index.html` to execute the React hydration payload (`self.__next_f.push(...)`).
- **Invariant**: The `Content-Security-Policy` header in [`public/_headers`](file:///c:/Users/Dell/Desktop/textshare/public/_headers) **MUST** include `'unsafe-inline'` for `script-src` and `style-src`.
- **Prohibited Action**: **NEVER** remove `'unsafe-inline'` from `public/_headers` in an attempt to make CSP "stricter". Doing so will cause the browser to silently block React hydration $\rightarrow$ all event listeners fail to attach $\rightarrow$ every button, modal, and drawer on production dies with zero console errors.
- **Golden Header Template**:
  ```http
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src 'self' https: blob: data:; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
  ```

---

## 2. Integrity & Author Invariants

### 💎 Rule 2: Zero Fake Data / Zero Mock Placeholders
- **Invariant**: Every indicator, volume meter, connection status, and test suite must be backed by real state.
- **Prohibited Action**: **NEVER** use `Math.random()` or hardcoded simulated timers for:
  - Microphone level bars (must read from `VoiceMesh` / `AnalyserNode` $0\dots 100\%$).
  - Speaking avatar pulse animations (must reflect genuine Web Audio VAD).
  - Online peer counters or fake room lists.
  - Test run durations or exit codes.

### 👤 Rule 3: Preserve Real Author & Licensing Information
- **Invariant**: The following author and licensing details must be maintained across all footers, legal modals, and metadata:
  - **Author**: Avishkar Kedar
  - **Website**: `https://avishkark.in`
  - **Email**: `avishkarkedar+text@gmail.com`
  - **License**: MIT License
  - **Repository**: `https://github.com/AvishkarKedar/textshare`
  - **Production URL**: `https://code.avishkark.in`

---

## 3. Architecture & Build Invariants

### ⚡ Rule 4: Static Export & Cloudflare Pages Functions
- **Context**: `next.config.ts` uses `output: "export"`, compiling all assets into `dist/`.
- **Invariant**:
  - **NEVER** add server-side `POST` / `GET` route handlers inside `src/app/api/` (e.g. `src/app/api/run/route.ts`). Doing so causes `next build` to fail immediately with `"Export encountered errors"`.
  - All dynamic API endpoints **MUST** reside inside `functions/api/*.ts` as Cloudflare Pages Functions (`/api/run`, `/api/crypto`, `/api/status`, `/api/generate`).

### 🛡️ Rule 5: Strict TypeScript Compilation (Zero Build Errors)
- **Invariant**: `typescript.ignoreBuildErrors` in [`next.config.ts`](file:///c:/Users/Dell/Desktop/textshare/next.config.ts) must **ALWAYS** remain omitted or set to `false`.
- **Requirement**: Before any git commit or deployment, run:
  1. `npx tsc --noEmit` $\rightarrow$ must exit with **0 errors**.
  2. `npm test` $\rightarrow$ all **56 tests must pass**.
  3. `npm run build` $\rightarrow$ must compile to `dist/` cleanly.

---

## 4. UI, Touch & Mobile Accessibility Invariants

### 📱 Rule 6: Touch-Friendly Button Visibility
- **Context**: Mobile and touch screens have no mouse-hover state.
- **Invariant**: Action buttons (delete, preview, copy, close, tab remove) must **NEVER** be styled with `opacity-0 group-hover:opacity-100` alone.
- **Standard**: Always use `opacity-100 sm:opacity-0 sm:group-hover:opacity-100` so actions are permanently visible on touch devices and elegantly reveal on desktop hover.
- **Touch Target**: Primary interactive elements must have a minimum hit target of `44x44px`.

### 🔘 Rule 7: Close Controls on All Modals & Drawers
- **Invariant**: Every drawer (Files, Voice, History, Bookmarks, Notifications, Browser) and modal (Faq, Status, Security, Crypto, Whiteboard, Tour) must feature:
  - An explicit, high-contrast close button (`<X className="h-4 w-4" />`) in the header.
  - Backdrop click dismissal (`onClick={() => toggle()}`).
  - Keyboard Escape (`Esc`) hotkey dismissal.

### 👂 Rule 8: WebRTC & Audio Autoplay Safety
- **Invariant**:
  - WebRTC microphone requests via `navigator.mediaDevices.getUserMedia` must always be wrapped in a `try...catch` block.
  - If permissions are denied or unavailable (e.g., non-HTTPS or headless testing), show a polite toast message without throwing unhandled exceptions.
  - Remote `<audio>` elements must include autoplay unlock event listeners (`click`, `touchstart`, `keydown`) to seamlessly recover from strict browser autoplay policies.

---

## 5. Summary Checklist Before Any Git Push

- [ ] `public/_headers` contains `'unsafe-inline'` for `script-src` and `style-src`.
- [ ] `npx tsc --noEmit` exits with 0 errors.
- [ ] `npm test` passes 56/56 tests.
- [ ] `npm run build` succeeds and updates `dist/`.
- [ ] Deploy with `npx wrangler pages deploy dist --project-name textshare --branch main`.
- [ ] Verify live at `https://code.avishkark.in`.
