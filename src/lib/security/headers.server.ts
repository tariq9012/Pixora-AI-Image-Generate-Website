/**
 * PHASE 14: HTTP security headers, applied to every response by the server
 * entry (src/server.ts).
 *
 * Reads process.env directly (not env.server.ts) on purpose: header
 * application must keep working even when environment validation fails, so
 * the friendly error page still ships with safe headers.
 *
 * CSP notes (deliberate, documented trade-offs):
 *  - script-src needs 'unsafe-inline' because TanStack Start streams inline
 *    hydration/dehydration scripts. Moving to a nonce/hash policy needs
 *    framework nonce support and a full-browser regression pass; tracked as
 *    a follow-up. 'unsafe-eval' is NOT allowed.
 *  - style-src needs 'unsafe-inline' (Tailwind/Radix inline styles, chart
 *    <style>) and Google Fonts (Sora/Inter are loaded from googleapis).
 *  - img-src allows the configured R2/S3 public origin and endpoint
 *    (public assets + short-lived signed URLs), plus data:/blob: for
 *    previews and the mask editor.
 *  - Stripe is used via hosted Checkout / Billing Portal REDIRECTS only, so
 *    no Stripe origin is needed. If Stripe.js is ever embedded, add
 *    https://js.stripe.com to script-src/frame-src and
 *    https://api.stripe.com to connect-src.
 *  - CSP is only sent in production; Vite dev (HMR websocket, react-refresh
 *    inline preamble) would otherwise break.
 */

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function storageOrigins(): string[] {
  const origins = [
    originOf(process.env["S3_PUBLIC_BASE_URL"]),
    originOf(process.env["S3_ENDPOINT"]),
  ];
  return Array.from(new Set(origins.filter((o): o is string => Boolean(o))));
}

export function buildContentSecurityPolicy(): string {
  const storage = storageOrigins();

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", ...storage],
    "media-src": ["'self'"],
    "connect-src": ["'self'", ...storage],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "upgrade-insecure-requests": [],
  };

  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(" ")}` : name))
    .join("; ");
}

export function applySecurityHeaders(response: Response): Response {
  const isProduction = process.env["NODE_ENV"] === "production";

  const headers: Array<[string, string]> = [
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"],
    ["X-Frame-Options", "DENY"],
  ];

  if (isProduction) {
    headers.push(["Content-Security-Policy", buildContentSecurityPolicy()]);
    // HSTS is only meaningful (and only honored) over HTTPS; production is
    // assumed to be HTTPS-only (Vercel enforces it on custom domains).
    headers.push(["Strict-Transport-Security", "max-age=31536000; includeSubDomains"]);
  }

  const apply = (target: Headers) => {
    for (const [name, value] of headers) {
      if (!target.has(name)) target.set(name, value);
    }
  };

  try {
    apply(response.headers);
    return response;
  } catch {
    // Some Response objects (e.g. ones produced by fetch()) have immutable
    // headers — rebuild with the same body/status and merge headers.
    const rebuilt = new Headers(response.headers);
    apply(rebuilt);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: rebuilt,
    });
  }
}
