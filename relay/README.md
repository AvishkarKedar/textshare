# AnonShare VPS Relay & Code Runner

A high-performance, self-hosted WebSocket relay and compilation runner for AnonShare.
Drop-in replacement for the Cloudflare Worker relay that eliminates Cloudflare limits, supports encrypted file chunking up to 25MB, and powers the multi-language code runner.

## 🔐 Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `ADMIN_PASSWORD` | *(unset)* | Admin API secret. **No default** — when unset, every `/admin/*` route returns 503 and the API is disabled (fails closed). Never commit the real value; set it via systemd override, `.env`, or Docker secrets. |
| `ALLOWED_ORIGINS` | production sites + localhost | Comma-separated browser origins allowed cross-origin on the HTTP API. Supports exact origins, `*.suffix` patterns, or `*` to restore the legacy open policy. WebSocket connections are unaffected (CORS never applied to WS). |
| `TRUSTED_PROXIES` | loopback + RFC1918 | CIDRs whose `X-Real-IP` / `X-Forwarded-For` / `CF-Connecting-IP` headers are honored for rate limiting. `off` disables header trust entirely (rate-limit by socket address). Client-supplied spoofed headers from untrusted addresses are always ignored. |
| `PORT` | `8787` | Listen port. |
| `HOST` | `0.0.0.0` | Bind address. |
| `CHUNK_STORAGE_DIR` | `$TMPDIR/anonshare-chunks` | Where encrypted file chunks are persisted. |
| `PY_BOOTSTRAP_PACKAGES` | `numpy,pandas,sympy,matplotlib,requests,beautifulsoup4,pillow` | Popular Python packages installed once at relay boot (into the service user's `~/.local`, read-only-bound into the sandbox). Empty string disables the bundle. Comma-separated pip names. |

### Python package bundle — how it works

The bwrap sandbox is fully network-isolated (`--unshare-net`), so `pip install` can never run *inside* a code execution. Instead, at boot the relay runs a one-time `pip install --user --break-system-packages` for the curated bundle and then read-only-binds `~/.local` into every sandbox — python resolves numpy/pandas/… exactly like system packages, with zero network access at run time. The install is non-blocking and cached (skipped when already importable). To add a package permanently, append it to `PY_BOOTSTRAP_PACKAGES` and restart the relay; to run a bare-stdlib runner, set `PY_BOOTSTRAP_PACKAGES=""`.

Abuse limits (per IP, per minute): 600 general requests, 60 room creates, 8 failed-auth attempts, 20 code runs, 24 concurrent WebSocket connections. File storage quotas: 1MB per chunk, 400 chunks per file, 32 files per room, 50MB per room.

## 🚀 Quick Start on VPS

### Option A: Docker Compose (Recommended)

1. Clone or copy the `relay` directory to your VPS (e.g. `/opt/anonshare-relay`):
   ```bash
   git clone https://github.com/AvishkarKedar/textshare.git
   cd textshare/relay
   ```

2. Set your admin password in `.env` (optional — unset means the admin API stays disabled):
   ```bash
   echo "ADMIN_PASSWORD=$(openssl rand -base64 24)" > .env
   chmod 600 .env
   ```

3. Launch with Docker Compose:
   ```bash
   docker compose up -d
   ```

### Option B: Node.js + PM2 / Systemd

```bash
cd relay
npm install --production
npm install -g pm2
pm2 start server.js --name anonshare-relay
pm2 save
pm2 startup
```

### Updating an existing deployment (pull + restart)

```bash
cd /opt/anonshare-relay          # or wherever the repo lives
git pull                         # picks up runner fixes + the python bundle
systemctl restart anonshare-relay  # or: pm2 restart anonshare-relay / docker compose up -d --build
journalctl -u anonshare-relay -n 20  # confirm: "python bundle: installed …"
```

The first boot after updating downloads the package bundle once (a few minutes at most); the code runner serves standard-library Python immediately in parallel. This same redeploy also activates the JavaScript/Go/Rust sandbox memory-cap fix and the C++-in-`.c` auto-routing.

---

## 🌐 Cloudflare DNS Setup

1. In your Cloudflare Dashboard, go to your domain (e.g. `avishkark.in`).
2. Add an **A record**:
   - **Type**: `A`
   - **Name**: `relay` (or `sync`)
   - **IPv4 address**: `<Your VPS Public IP>`
   - **Proxy status**: **Proxied (Orange Cloud)** ☁️ *(Free SSL, DDoS protection, unlimited WebSockets)*
3. Set SSL/TLS mode to **Full** in Cloudflare.
4. On your VPS, run Caddy or Nginx (`nginx.conf` included) to reverse-proxy port 8787.

---

## ⚙️ Connecting AnonShare to Your VPS Relay

In `src/lib/relay.ts`, set:
```typescript
export const DEFAULT_RELAY = "relay.yourdomain.com"
```
Or append `?relay=relay.yourdomain.com` in your browser URL.
