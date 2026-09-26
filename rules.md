# anonshare — Inviolable Engineering Rules & Agent Invariants

> **Audience:** AI Coding Agents, Core Maintainers, and Open-Source Contributors  
> **Authority Level:** Absolute / Inviolable  
> **Scope:** All code modifications, commits, pull requests, and Cloudflare deployments  

---

## 1. Security & Content Security Policy (CSP) Invariants

### 🚨 Rule 1: The CSP React Hydration Invariant (CRITICAL)
- **Problem Statement**: `anonshare` is configured as a Next.js 16 static export (`output: "export"` in `next.config.ts`). Next.js static exports output inline `<script>` tags in `index.html` to inject the React hydration payload (`self.__next_f.push(...)`).
- **Invariant**: The `Content-Security-Policy` header in [`public/_headers`](file:///c:/Users/Dell/Desktop/textshare/public/_headers) **MUST ALWAYS** include `'unsafe-inline'` inside `script-src` and `style-src`.
- **Why this fails if modified**: If an agent removes `'unsafe-inline'` in an attempt to make the CSP "stricter", the browser will silently trigger a `securitypolicyviolation` on `index.html` inline scripts. External chunks load, but React never attaches to the DOM (`reactKeys: []` on all elements). **Every button, drawer, modal, and accordion on production becomes dead with ZERO console errors.**

#### ❌ PROHIBITED (Breaks React Hydration):
```http
# BAD: Missing 'unsafe-inline' in script-src
Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self';
```

#### ✅ MANDATORY (Hydration Works 100%):
```http
# GOOD: Permissive inline scripts required for Next.js static export
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src 'self' https: blob: data:; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
```

---

## 2. Integrity & Author Invariants

### 💎 Rule 2: Zero Fake Data / Zero Mock Placeholders
- **Invariant**: Every indicator, volume meter, connection status, avatar ring, and test execution must be driven by genuine state.
- **Prohibited Patterns**: Never write `Math.random()` or simulated timer counters for:
  - Microphone level bars (must read actual $0\dots 100\%$ levels from Web Audio `AnalyserNode`).
  - Speaking avatar pulse rings (must reflect real Web Audio VAD $> 20$ threshold).
  - Online peer counters (must reflect real connected socket peers).
  - Test run durations or exit codes.

#### ❌ PROHIBITED:
```tsx
// BAD: Random simulation in UI component
<div style={{ width: `${v.pushToTalk ? 40 + Math.random() * 60 : 0}%` }} />
const isSpeaking = p.id === "me" ? v.pushToTalk : Math.random() > 0.7;
```

#### ✅ MANDATORY:
```tsx
// GOOD: Real audio level and peer speaking state
<div style={{ width: v.muted ? "0%" : `${Math.min(100, Math.max(0, v.level || 0))}%` }} />
const isSpeaking = p.id === "me" ? v.speaking : Boolean(p.speaking);
```

---

### 👤 Rule 3: Author Credential & Legal Invariant
- **Invariant**: The following author credentials and licensing details must remain uncompromised across all legal notices, footers, and package metadata:
  - **Author**: `Avishkar Kedar`
  - **Website**: `https://avishkark.in`
  - **Email**: `avishkarkedar+text@gmail.com`
  - **License**: `MIT License`
  - **GitHub Repository**: `https://github.com/AvishkarKedar/textshare`
  - **Production Endpoint**: `https://code.avishkark.in`

---

## 3. Architecture & Build Invariants

### ⚡ Rule 4: Static Export & Cloudflare Pages Functions Routing
- **Context**: `next.config.ts` specifies `output: "export"`.
- **Invariant**:
  - **NEVER** create server route handlers in `src/app/api/` (e.g., `src/app/api/run/route.ts`). Doing so causes `next build` to fail immediately with `"Export encountered errors"`.
  - All dynamic API logic **MUST** reside in `functions/api/*.ts` as Cloudflare Pages Functions.

#### ❌ PROHIBITED:
```
src/app/api/run/route.ts      <-- FAILS NEXT.JS STATIC EXPORT
src/app/api/crypto/route.ts   <-- FAILS NEXT.JS STATIC EXPORT
```

#### ✅ MANDATORY:
```
functions/api/run.ts          <-- NATIVE CLOUDFLARE PAGES FUNCTION
functions/api/crypto.ts       <-- NATIVE CLOUDFLARE PAGES FUNCTION
```

---

### 🛡️ Rule 5: Strict TypeScript Compilation (Zero Error Tolerance)
- **Invariant**: `typescript.ignoreBuildErrors` in [`next.config.ts`](file:///c:/Users/Dell/Desktop/textshare/next.config.ts) must **ALWAYS** remain omitted or set to `false`.
- **Enforcement**: Before every commit, execute `npx tsc --noEmit`. The command must exit with code 0.

---

## 4. UI, Touch & Mobile Accessibility Invariants

### 📱 Rule 6: Touch-Friendly Button Visibility
- **Context**: Touch and mobile devices do not possess a mouse-hover state.
- **Invariant**: Primary action buttons (preview, download, delete, tab close) must **NEVER** be styled with `opacity-0 group-hover:opacity-100` alone.
- **Requirement**: Always use `opacity-100 sm:opacity-0 sm:group-hover:opacity-100`.

#### ❌ PROHIBITED:
```tsx
// BAD: Invisible on mobile touch screens
<button className="opacity-0 group-hover:opacity-100" onClick={handleDelete}>
  <Trash className="h-3 w-3" />
</button>
```

#### ✅ MANDATORY:
```tsx
// GOOD: Always visible on mobile, hoverable on desktop
<button className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer" onClick={handleDelete}>
  <Trash className="h-3 w-3" />
</button>
```

---

### 🔘 Rule 7: Modal & Drawer Close Controls
- **Invariant**: Every drawer and modal overlay must support three independent dismissal mechanisms:
  1. An explicit close button (`<X className="h-4 w-4" />`) in the top-right header.
  2. Backdrop click dismissal (`onClick={() => toggle()}`).
  3. Keyboard Escape (`Esc`) keypress event handler.

---

### 👂 Rule 8: WebRTC & Audio Autoplay Safety
- **Invariant**:
  - `navigator.mediaDevices.getUserMedia` calls must always be wrapped in a `try...catch` block displaying user-friendly error toasts.
  - Remote `<audio>` elements must include autoplay unlock event listeners (`click`, `touchstart`, `keydown`) to seamlessly recover from strict browser autoplay policies.

---

## 5. State Management & Lifecycle Invariants

### 🔄 Rule 9: Zustand Store Immutability
- **Invariant**: Store mutations must produce fresh object references using immutable spread operators. Never mutate state in-place.

#### ❌ PROHIBITED:
```ts
// BAD: Mutating state array directly
set((s) => {
  s.files.push(newFile);
  return { files: s.files };
});
```

#### ✅ MANDATORY:
```ts
// GOOD: Returning fresh array reference
set((s) => ({ files: [...s.files, newFile] }));
```

---

### 🧹 Rule 10: Event Listener Cleanup & Memory Safety
- **Invariant**: Every `useEffect` attaching window listeners, WebSocket subscriptions, or audio intervals must return a cleanup function.

---

## 6. Cryptography & Data Format Invariants

### 🔑 Rule 11: Cryptographic Salt & Constant Preservation
- **Invariant**: The salt strings `textshare|` and `textshare-auth|` must **NEVER** be modified. They are cryptographic constants; altering them breaks decryption for all existing rooms.

---

### 📦 Rule 12: Client-Side Binary ZIP Generation
- **Invariant**: When exporting project ZIPs via `new Blob([zip])`, cast the `Uint8Array` buffer to `zip as unknown as BlobPart` to satisfy strict TypeScript DOM typings.

---

## 7. Repository Hygiene Invariants

### 🗄️ Rule 13: Git Tracking Cleanliness
- **Invariant**: Never commit SQLite `.db` files, screenshot `.png` images, temporary logs, or tool output directories to git. Keep `.gitignore` updated.

---

### 📥 Rule 14: Standard Input (stdin) Sanitization & EPIPE Protection
- **Invariant**:
  - All input piped to child compiler / runner processes must be normalized to LF (`\n`), stripping Windows carriage returns (`\r`), and must guarantee a trailing newline so terminal readers (`input()`, `scanf`, `cin >>`, `read`) never stall.
  - An error handler (`proc.stdin.on('error', () => {})`) **MUST** be attached to prevent unhandled `EPIPE` when processes exit before reading full inputs.

---

### 🎨 Rule 15: Canvas Touch Pointer Capture & Viewport Isolation
- **Invariant**:
  - All `<canvas>` interactive surfaces **MUST** use Pointer Events (`onPointerDown`, `onPointerMove`, `onPointerUp`) with `e.currentTarget.setPointerCapture(e.pointerId)`.
  - The canvas container **MUST** specify `touch-action: none` (Tailwind `touch-none`) to prevent mobile browsers from hijacking touch drawing as page pinch-to-zoom or vertical scrolling.

---

### 🔤 Rule 16: Turbopack Google Font Variable Font Configuration
- **Invariant**:
  - When importing variable Google Fonts (e.g., `JetBrains_Mono`, `Geist`, `Geist_Mono`) via `next/font/google` with Turbopack, **NEVER** specify static weight arrays (`weight: ["400", "500", "600", "700"]`).
  - Specifying static weight arrays on variable fonts generates multiple query parameters, causing Turbopack's static export font replacer to crash on CI with: `Error: Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font' (next/font/google queries have exactly one entry)`.
  - Always configure variable fonts with `subsets: ["latin"]` alone.

---

## 8. Verification & Deployment Standard

### 🚀 Pre-Commit & Deployment Checklist:
1. `npx tsc --noEmit` $\longrightarrow$ **0 errors**.
2. `npm test` $\longrightarrow$ **20/20 passing tests**.
3. `npm run build` $\longrightarrow$ **Clean Turbopack export into `dist/`**.
4. `git status` $\longrightarrow$ **Clean working tree with zero untracked binaries**.
5. `npx wrangler pages deploy dist --project-name textshare --branch main` $\longrightarrow$ **Successful Cloudflare deploy**.
6. `curl -I https://code.avishkark.in` $\longrightarrow$ **Verify `script-src` contains `'unsafe-inline'`**.
