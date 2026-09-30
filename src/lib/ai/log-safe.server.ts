/**
 * Server-side diagnostics for "the model produced an image but we could not
 * save it" failures. Those failures are deliberately shown to the browser as
 * a generic "Failed to save the generated image." — but before this helper the
 * real cause was swallowed too, so nothing appeared in the terminal.
 *
 * Logs ONLY: error name, a short message, and any `code` (for example our
 * FileValidationError code, a Node fs code like EACCES, or a Postgres code).
 * No request bodies, no headers, no environment values, no image bytes.
 */
function shorten(value: unknown): string {
  return String(value ?? "").slice(0, 400);
}

export function logPersistFailure(error: unknown): void {
  if (!(error instanceof Error)) {
    console.error("[generation] output could not be saved:", shorten(error));
    return;
  }

  const withCode = error as Error & { code?: unknown; cause?: unknown };
  const cause = withCode.cause instanceof Error ? withCode.cause : undefined;
  const causeWithCode = cause as (Error & { code?: unknown }) | undefined;

  console.error("[generation] output could not be saved:", {
    name: error.name,
    code: withCode.code !== undefined ? shorten(withCode.code) : undefined,
    message: shorten(error.message),
    causeName: cause?.name,
    causeCode: causeWithCode?.code !== undefined ? shorten(causeWithCode.code) : undefined,
    causeMessage: cause ? shorten(cause.message) : undefined,
  });
}