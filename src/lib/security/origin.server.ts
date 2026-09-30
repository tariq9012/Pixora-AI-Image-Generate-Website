import { env } from "@/lib/env.server";

/**
 * PHASE 14: same-origin check for state-changing API routes that are NOT
 * TanStack server functions (server functions are covered by
 * createCsrfMiddleware in src/start.ts, which is filtered to
 * handlerType === "serverFn"). Raw `server.handlers` routes such as
 * POST /api/assets/upload must call this themselves. The Stripe webhook is
 * the deliberate exception: it is authenticated by Stripe's signature.
 *
 * Browsers always send `Origin` on cross-site and same-site POSTs and
 * `Sec-Fetch-Site` on modern engines. In production a request with neither
 * header is treated as non-browser and rejected; in development it is
 * allowed so curl/scripts keep working.
 */
export function isSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    const allowed = new Set<string>();
    try {
      allowed.add(new URL(request.url).origin);
    } catch {
      // ignore malformed request.url
    }
    try {
      allowed.add(new URL(env.APP_URL).origin);
    } catch {
      // ignore malformed APP_URL
    }
    return allowed.has(origin);
  }

  if (fetchSite) return true; // same-origin / user-initiated, no Origin header
  return env.NODE_ENV !== "production";
}
