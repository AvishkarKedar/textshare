// Local development shim for Cloudflare Pages Functions
// Listens on 127.0.0.1:8788 and mirrors functions/api/* endpoints during `next dev`.
import http from "node:http";

const PORT = 8788;
const RELAY_HOST = process.env.RELAY_URL || "https://relay.avishkark.in";

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/run" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const proxyRes = await fetch(`${RELAY_HOST}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language: parsed.language,
            code: parsed.source || parsed.code,
            stdin: parsed.stdin,
          }),
        });
        const data = await proxyRes.json();
        res.writeHead(proxyRes.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, stderr: `Dev shim error: ${err.message}` }));
      }
    });
    return;
  }

  if (url.pathname === "/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, status: "healthy", shim: true }));
    return;
  }

  if (url.pathname === "/crypto" && req.method === "POST") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, rounds: 600000 }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[dev-api-shim] API shim listening on http://127.0.0.1:${PORT} -> forwarding to ${RELAY_HOST}`);
});
