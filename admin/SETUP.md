# Admin dashboard setup

This dashboard is a separate static site from the main app, meant to be deployed on its own subdomain (`admin.code.avishkark.in`) so it never shares a deploy, cache, or blast radius with the public site. Everything in this folder is plain HTML/CSS/JS - no build step.

## 1. Set the admin password on the relay (required)

The dashboard talks to your existing `textshare-sync` Worker. Nothing here works until you set a secret on it:

```bash
cd worker
npx wrangler secret put ADMIN_PASSWORD
# paste a strong password when prompted
```

If this secret is unset, every `/admin/*` route on the Worker returns `503` and the dashboard cannot be used - it fails closed, not open.

Then deploy the updated Worker (it now also registers a lightweight room index used by the dashboard - see "What this changes about the privacy model" below):

```bash
npx wrangler deploy
```

## 2. Create the Cloudflare Pages project

This has to be a **second, separate** Pages project from the main site (the main site's Pages project already deploys the repo root as `code.avishkark.in`; this one deploys only the `admin/` folder):

1. Cloudflare dashboard -> Workers & Pages -> Create -> Pages -> Connect to Git -> same `textshare` repo.
2. Build settings: **no build command**, output directory `admin`.
3. Deploy, then go to the new project's **Custom domains** and add `admin.code.avishkark.in`.
4. Cloudflare will prompt you to add the DNS record automatically if `code.avishkark.in`'s zone is already on Cloudflare (it is).

## 3. First login

1. Open `https://admin.code.avishkark.in`.
2. On first visit it asks for your relay's base URL - enter your Worker's URL (either the `*.workers.dev` one or a custom domain if you've mapped one, e.g. `https://sync.avishkark.in`). This is stored only in that browser's `localStorage`.
3. Enter the `ADMIN_PASSWORD` you set in step 1.

The session token is valid for 12 hours and is never sent anywhere except your own Worker.

## What this changes about the privacy model

Before this change, the relay kept **no** record of which room codes existed beyond each room's own isolated Durable Object (which nothing outside that room could enumerate). To let this dashboard list and moderate rooms, the relay now also keeps a small global index: room code, creation time, TTL, and whether a password is set - nothing else. No content, no passwords, no derived keys, and nothing that isn't already visible to anyone who is simply *in* the room. This is documented in `WHITEPAPER.md` and `COMPLIANCE.md`. If you'd rather not have even that index exist, don't set `ADMIN_PASSWORD` - the registry writes are best-effort and the feature stays fully off.

## Scope of what's dashboard-configurable

- **Live-adjustable** (via the "Rate limits" panel, effective within ~15s, no redeploy): requests/min/IP, room-creates/min/IP, failed-auth-attempts/min/IP, max peers per room.
- **Not live-adjustable** (fixed in code, requires editing `worker/src/index.js` and redeploying): per-message rate (`RATE_PER_SEC`) - this is checked on every single WebSocket message, so making it depend on a network round-trip per message would be a real latency regression, not just a nicety.
