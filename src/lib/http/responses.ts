/**
 * Reusable shapes for any server route/handler in the app. Keeping these
 * in one place means every endpoint (health check today, real API routes
 * in later phases) returns errors in the same predictable envelope, and
 * none of them accidentally leak a stack trace to the client.
 */

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
}

export function ok<T>(data: T, init?: ResponseInit): Response {
  const body: ApiSuccess<T> = { success: true, data };
  return jsonResponse(body, { status: 200, ...init });
}

export function created<T>(data: T, init?: ResponseInit): Response {
  const body: ApiSuccess<T> = { success: true, data };
  return jsonResponse(body, { status: 201, ...init });
}

export function badRequest(message: string, details?: unknown): Response {
  const body: ApiErrorBody = { success: false, error: { code: "BAD_REQUEST", message, details } };
  return jsonResponse(body, { status: 400 });
}

export function unauthorized(message = "Authentication is required."): Response {
  const body: ApiErrorBody = { success: false, error: { code: "UNAUTHORIZED", message } };
  return jsonResponse(body, { status: 401 });
}

export function forbidden(message = "You do not have permission to do this."): Response {
  const body: ApiErrorBody = { success: false, error: { code: "FORBIDDEN", message } };
  return jsonResponse(body, { status: 403 });
}

export function notFound(message = "The requested resource was not found."): Response {
  const body: ApiErrorBody = { success: false, error: { code: "NOT_FOUND", message } };
  return jsonResponse(body, { status: 404 });
}

/**
 * Generic 500 response. Callers should log/report the real `error` object
 * server-side themselves (see error-reporting.ts) before calling this —
 * this helper never forwards stack traces or internal messages to the
 * client, in production or otherwise.
 */
export function internalError(message = "Something went wrong. Please try again."): Response {
  const body: ApiErrorBody = { success: false, error: { code: "INTERNAL_ERROR", message } };
  return jsonResponse(body, { status: 500 });
}
