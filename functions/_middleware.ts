// Cloudflare Pages Function: root middleware
// 301-redirects the duplicate www host to the canonical host — but ONLY for
// safe, non-upgrade requests (GET/HEAD).
//
// Why the method guard matters (regression fixed 2026-09-30): browsers
// re-issue a 301-redirected POST as GET and drop the request body, and
// WebSocket upgrade requests cannot follow redirects at all. Redirecting
// every method silently turned `POST /api/run` on the www host into
// `GET /api/run` (the info endpoint), which the editor rendered as garbled
// run output ("exit 0 · undefinedms"), and any non-JSON response made
// `res.json()` throw a bare SyntaxError into the terminal. Crawlers and
// human navigation always use GET/HEAD, so SEO canonicalization of the www
// host is fully preserved while APIs and sockets keep working for clients
// still pointing at www.
// (https://developers.cloudflare.com/pages/how-to/www-redirect/)

interface PagesContext {
  request: Request;
  next: () => Promise<Response>;
}

const CANONICAL_HOST = "code.avishkark.in";
const WWW_HOST = "www.code.avishkark.in";

export async function onRequest(context: PagesContext): Promise<Response> {
  const req = context.request;
  const url = new URL(req.url);

  const isSafeNavigation =
    (req.method === "GET" || req.method === "HEAD") &&
    !req.headers.get("upgrade");

  if (url.hostname === WWW_HOST && isSafeNavigation) {
    const target = new URL(req.url);
    target.hostname = CANONICAL_HOST;
    return Response.redirect(target.toString(), 301);
  }

  return context.next();
}
