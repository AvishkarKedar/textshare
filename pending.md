# pending.md — textshare / anonshare open items

Shared task list for **Avishkar (owner)** and **the agent (Super Z)**.
Anything done gets moved to the bottom "Completed" section (or deleted) — never silently.

**Last updated:** 2026-09-27 (after audit round 2 — mobile Run-FAB removal, failover live-verified, P3 closed)
**Live state at last check:** all four endpoints healthy — code.avishkark.in v5.5.0 · relay.avishkark.in redeployed (Run verified: python/js/bash/go) · backup Worker healthy (failover + room self-heal live-tested) · admincode 200 OK

---

## P0 — ~~URGENT~~ ✅ RESOLVED 2026-09-27 (owner redeployed the VPS relay)

Probed live on 2026-09-23 — every run on `relay.avishkark.in/run` fails:

| language | result |
|----------|--------|
| python / bash / javascript | `bwrap: Creating new namespace failed: Resource temporarily unavailable` (fails in ~4 ms, persistent across retries) |
| go | bwrap starts, but compile dies with `write $WORK/b009/_pkg_.a: file too large` (old RLIMIT_FSIZE too small for Go builds) |

This means the **Run button in production (code.avishkark.in) is effectively dead right now** for python, bash, JS, Go — and C/C++/Java go through the same bwrap sandbox, so they are hit by the namespace failure too.

**Do this (one SSH session, ~5 min):**

```bash
# 1. Diagnose the namespace exhaustion
cat /proc/sys/user/max_user_namespaces
ps aux | grep -c bwrap          # strays? kill them, or just reboot the VPS

# 2. Redeploy the v5.3 relay (also fixes the JS/Go/Rust memcap + Go build size limit + python bundle)
cd /opt/anonshare-relay          # or wherever the repo lives
git pull                         # picks up runner fixes + the python bundle
systemctl restart anonshare-relay # or: pm2 restart anonshare-relay / docker compose up -d --build
journalctl -u anonshare-relay -n 20   # confirm: "python bundle: installed ..."
```

If `git pull` on the VPS complains (history was force-pushed to reach v5.3): `git fetch origin && git reset --hard origin/main`.

**Verify after redeploy** (agent can also do this on request):

```bash
curl -s -X POST https://relay.avishkark.in/run -H "Content-Type: application/json" \
  -d '{"language":"python","code":"print(1+1)","stdin":""}'          # → "2"
curl -s -X POST https://relay.avishkark.in/run -H "Content-Type: application/json" \
  -d '{"language":"go","code":"package main\nimport \"fmt\"\nfunc main(){fmt.Println(\"go works\")}","stdin":""}'
```

Note: the relay's `/health` reports `version: 4` **even in the new code** — don't use that field to judge the deploy; judge by the run probes above.

---

## P1 — ✅ RESOLVED (PAT provided; agent pushes working)

> **SECURITY REMINDER:** both tokens shared in chat (classic `ghp_71Q8...` + fine-grained `github_pat_11BXQCH5...`) should be **revoked** now that the work is pushed — they were pasted in plaintext.

The agent's PAT was lost when the session restarted; nothing can be pushed since.
Create a fine-grained PAT (repo **AvishkarKedar/textshare**, **Contents: read & write**) and paste it in chat — or push the agent's commits yourself.
Pushing to `main` auto-deploys to Cloudflare Pages (code.avishkark.in) within ~2 min.

---

## P2 (agent): re-apply the lost rename / generated-file sync fixes — ✅ COMPLETED 2026-09-27

Both fixes are now live in origin/main:
1. **Rename sync** — `updateYFile(fileId, meta)` in `src/lib/session.ts` + `setFileLanguage` routes through it when a session is active (merged earlier).
2. **Generated-file sync** — `insertGeneratedUi` in `src/lib/store.ts` now routes through `addYFile(name, "html", gen.html)` when a session is active (commit 1373e89, browser-verified: the generated file appears in the owner's AND peers' tab bars and the full HTML content syncs).

Renamed-file and generated-file behavior verified end-to-end in a two-session local stack.

---

## P3 (agent): /goal2 — Run support for HTML + Go — ✅ RESOLVED 2026-09-27

- **Go: verified end-to-end.** `functions/api/run.ts` whitelists `go`; production relay executes it (probe 2026-09-27: `go works`, exit 0, ~5.2s).
- **HTML: implemented.** Pressing Run on `.html/.htm/.svg/.md/.markdown/.xml` files mounts the live interactive Web Preview and logs `$ render <file> · live interactive preview mounted` in the terminal (`runCode` branch in `src/lib/store.ts`).

---

- _Nothing open._ The failover ownerless-room race below was **fixed, deployed, and live-verified on 2026-09-27 (M-21)**: a `create=1&o=<owner_token>` reconnect carrying valid room auth (`a=<auth>` hash-match) now claims/updates ownership of an ownerless room on both `relay/server.js` (HTTP preflight + WS upgrade) and `worker/src/index.js` (persisted to DO storage); `/room/:code/exists` reports `ownerless` and the owner client auto-sends the claim when it sees the flag. Verified: 18/18 protocol assertions + full browser flow (joiner self-heal → ownerless room → owner rejoin → promotion → owner delete succeeds → both peers killed). **Deployment status:** Both VPS Relay (`relay.avishkark.in`) and Cloudflare Worker (`textshare-sync.avishkarkedar.workers.dev`) have been deployed and verified live.

---

## Completed (context only)

- v5.3 live on code.avishkark.in and previously verified end-to-end in production (CI #79 green): stdin UX (python `input()` ×2 verified), editor keyboard intelligence, `.c`→C++ auto-routing, real room delete, mobile 390 px clean.
- Voice/whiteboard removed cleanly in v5.2; typing indicators + color attribution restored.

---

## P4 (owner, ~10 min): Google indexing — the one step the agent cannot do

On-page SEO is complete and deployed (M-23 + keyword patch: title, description, keywords,
JSON-LD WebApplication/WebSite/FAQPage, sitemap.xml, robots.txt, OG/Twitter cards, IndexNow
key for Bing/Yandex). The site is **not yet in Google's index** (verified 2026-09-27 via web
search — zero results). Indexing is the remaining blocker; ranking follows after.

**Do this once (10 minutes):**

1. Open https://search.google.com/search-console → "Add property".
2. Choose **URL prefix** → `https://code.avishkark.in` (simplest) — or **Domain** `avishkark.in`
   (covers all subdomains, needs a DNS TXT record at your registrar/Cloudflare).
3. Verify ownership:
   - URL-prefix method "HTML tag" gives a meta tag like
     `<meta name="google-site-verification" content="XXXX" />` — **paste that content value
     into the chat and the agent will embed it + push** (Next.js `verification.google` field).
   - (Alternative: upload the HTML verification file — send it and the agent adds it to `public/`.)
4. In Search Console: **Sitemaps → submit `sitemap.xml` → Submit.**
5. **URL Inspection** (top search bar) → paste `https://code.avishkark.in/` → **Request indexing.**
6. Google typically indexes within 1–7 days after a request. Check progress: URL Inspection →
   "Page indexing" report (also shows crawl errors if any).

**Optional but compounds ranking (backlinks — the honest lever for generic keywords):**
- Post the site once on Reddit (r/webdev, r/programming tools threads), Hacker News Show HN,
  or Product Hunt launch. The GitHub README already links the site (do-follow from a strong domain).
- Bing Webmaster Tools (https://www.bing.com/webmasters) — can import straight from Search
  Console; Bing/DuckDuckGo/Yandex are already pinged via IndexNow (key
  `public/1e3f60e998e276d63c5f3711f3651cb9.txt`).

**Expectations (honest):** "Anonshare" → top result within days of indexing (unique brand,
all signals aligned). "live code" / "code share" / "live text share" — competitive generic
terms owned by Microsoft Live Share, GitHub et al.; a 1-day-old site with no backlinks will
not outrank them immediately. Rankings grow with usage signals + backlinks over weeks/months.
