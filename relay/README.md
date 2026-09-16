# AnonShare VPS Relay & Code Runner

A high-performance, self-hosted WebSocket relay and compilation runner for AnonShare.
Drop-in replacement for the Cloudflare Worker relay that eliminates Cloudflare limits, supports encrypted file chunking up to 25MB, and powers the multi-language code runner.

## 🚀 Quick Start on VPS

### Option A: Docker Compose (Recommended)

1. Clone or copy the `relay` directory to your VPS (e.g. `/opt/anonshare-relay`):
   ```bash
   git clone https://github.com/AvishkarKedar/textshare.git
   cd textshare/relay
   ```

2. Set your admin password in `.env` (optional):
   ```bash
   echo "ADMIN_PASSWORD=my-secure-admin-pass" > .env
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

In `app.js`, set:
```javascript
const DEFAULT_RELAY = 'relay.yourdomain.com'
```
Or append `?relay=relay.yourdomain.com` in your browser URL.
