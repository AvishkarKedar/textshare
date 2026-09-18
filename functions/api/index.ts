// Cloudflare Pages Function: /api

export async function onRequestGet(): Promise<Response> {
  return Response.json({
    ok: true,
    service: "anonshare-api",
    version: "5.1.0",
    endpoints: [
      "/api/crypto",
      "/api/generate",
      "/api/run",
      "/api/status",
    ],
  });
}
