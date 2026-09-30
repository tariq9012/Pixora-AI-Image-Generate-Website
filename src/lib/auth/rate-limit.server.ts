/**
 * Minimal in-memory sliding-window-ish rate limiter, keyed by whatever the
 * caller passes (here: the submitted email, so it works without needing
 * the caller's IP address). Good enough to blunt naive brute-force/spam
 * attempts today.
 *
 * PRODUCTION LIMITATION (Phase 14 audit): state lives per server instance,
 * so on Vercel each warm function instance has its own counters and a
 * redeploy/cold start resets them. It blunts naive abuse only. Financial
 * and credit safety do NOT depend on it — those rely on DB constraints and
 * atomic SQL (see credits.server.ts, billing/webhook-events.server.ts).
 * Replace with a shared store before relying on it for abuse control.
 *
 * Original note: state lives
 * in process memory, so it resets on redeploy and does NOT coordinate
 * across multiple server instances/edge regions. Before running more than
 * one instance in production, swap the `attempts` Map below for a shared
 * store (Redis, Upstash, a Durable Object, etc.) behind this same
 * `checkRateLimit` signature — nothing calling it needs to change.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

let lastSweepAt = 0;

/** PHASE 14: bounded memory — drop expired windows at most once a minute. */
function sweepExpired(now: number): void {
  if (now - lastSweepAt < 60_000) return;
  lastSweepAt = now;
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  { max, windowMs }: { max: number; windowMs: number },
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  sweepExpired(now);
  const entry = attempts.get(key);

  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= max) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}
