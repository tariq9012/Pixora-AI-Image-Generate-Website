import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env.server";

/**
 * PHASE 14B: machine-to-machine authorization for cron endpoints.
 *
 * Accepts ONLY `Authorization: Bearer <CRON_SECRET>` — the header Vercel
 * Cron sends automatically when a CRON_SECRET env var exists. The secret is
 * never read from the query string. Both sides are hashed first so the
 * comparison is constant-time and length-independent.
 *
 * Returns false when CRON_SECRET is not configured (callers should answer
 * 503 before calling this, so "not configured" is distinguishable from
 * "wrong secret").
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return false;

  const provided = header.slice("Bearer ".length).trim();
  if (!provided) return false;

  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
