import type { NextConfig } from "next";

/**
 * Dev-only API rewrites.
 *
 * Production is a static export served by Cloudflare Pages, where /api/* is
 * handled by functions/api/* (the real edge functions). During `next dev`
 * those functions don't exist, so we proxy the same three endpoints to the
 * local dev shim (scripts/dev-api-shim.js → 127.0.0.1:8788), which mirrors
 * the edge function contracts against the local relay (relay/server.js).
 * The rewrites are gated to development only — the production build is a
 * pure static export and never includes them.
 */
const dev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "dist",
  images: {
    unoptimized: true,
  },
  reactStrictMode: false,
  // Dev server cross-origin guard: accessing `next dev` via 127.0.0.1 (instead
  // of localhost) makes Next 16 block its own dev resources (fonts, chunks) —
  // the page then renders as static HTML that never hydrates, with zero
  // console errors. Allow both loopback hosts in development.
  ...(dev ? { allowedDevOrigins: ["localhost", "127.0.0.1"] } : {}),
  ...(dev
    ? {
        async rewrites() {
          return [
            { source: "/api/run", destination: "http://127.0.0.1:8788/run" },
            { source: "/api/status", destination: "http://127.0.0.1:8788/status" },
            { source: "/api/crypto", destination: "http://127.0.0.1:8788/crypto" },
            { source: "/api/generate", destination: "http://127.0.0.1:8788/generate" },
          ];
        },
      }
    : {}),
};

export default nextConfig;
