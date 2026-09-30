/**
 * Client-side error reporting.
 *
 * This is intentionally a thin, dependency-free wrapper around `console.error`.
 * Prod React does not rethrow errors caught by an error boundary to
 * `window.onerror`, so without this call those failures would otherwise never
 * reach the console/log pipeline with full context (route, cause, etc).
 *
 * Loaders and server fns commonly throw a raw `Response`; `String(it)` on a
 * Response is the opaque "[object Response]", so pull out the status and URL
 * instead of stringifying it directly.
 *
 * Swap the body of this function for a real error-tracking SDK
 * (e.g. Sentry, Bugsnag) when one is introduced in a later phase.
 */
export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error("[Pixora AI] Unhandled UI error", {
    message,
    ...(stack !== undefined && { stack }),
    route: window.location.pathname,
    ...context,
  });
}
