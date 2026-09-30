/**
 * Neon's pooled connection can close an idle connection out from under
 * postgres.js — most likely to bite right after a slow external call
 * (e.g. waiting on an AI provider) leaves the one pooled connection
 * (dev runs with `max: 1`) sitting idle for several seconds. postgres.js
 * doesn't transparently retry a write against a connection it discovers
 * is already closed; the next query on it just throws.
 *
 * This retries exactly once, only for that specific class of error —
 * anything else (a real constraint violation, a bug in the query, etc.)
 * still fails immediately and normally.
 */
export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isTransientConnectionError =
        /CONNECTION_CLOSED|CONNECTION_ENDED|ECONNRESET|CONNECTION_DESTROYED/i.test(message);

      if (!isTransientConnectionError || attempt === maxAttempts) {
        throw error;
      }

      console.warn(
        `Retrying database operation after a dropped connection (attempt ${attempt}/${maxAttempts}):`,
        message,
      );
      // Brief backoff so a still-recovering pool has a moment before the
      // next attempt, rather than hammering it immediately.
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }

  // Unreachable (the loop always returns or throws), but keeps TypeScript
  // happy about every code path returning/throwing.
  throw lastError;
}
