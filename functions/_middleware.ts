// Cloudflare Pages Function: root middleware
// 301-redirects the duplicate www host to the canonical host.
//
// Why middleware and not _redirects: Cloudflare Pages' _redirects file does
// not support domain-level (host-based) rules — the dashboard "Bulk
// Redirects" feature or a Function is required
// (https://developers.cloudflare.com/pages/how-to/www-redirect/).
// This Function gives the same result entirely from the repo: every request
// to www.code.avishkark.in is permanently redirected (301) to the same URL
// on code.avishkark.in, so search engines index a single host. All other
// hosts (and preview deployments) pass straight through untouched.

interface PagesContext {
  request: Request;
  next: () => Promise<Response>;
}

const CANONICAL_HOST = "code.avishkark.in";
const WWW_HOST = "www.code.avishkark.in";

export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);

  if (url.hostname === WWW_HOST) {
    const target = new URL(context.request.url);
    target.hostname = CANONICAL_HOST;
    return Response.redirect(target.toString(), 301);
  }

  return context.next();
}
