import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

import { env } from "@/lib/env.server";

/**
 * NOTE ON UNCERTAINTY: like src/routes/api.health.ts from Phase 2, the
 * exact cookie helper API for this project's TanStack Start version could
 * not be verified against real type definitions (no network access in the
 * environment that wrote this). `getCookie(name)` / `setCookie(name,
 * value, options)` / `deleteCookie(name, options)` from
 * `@tanstack/react-start/server` are this author's best-effort match. If
 * `npm run build` reports an unresolved import or a signature mismatch,
 * this is the one file in the whole auth system that needs a matching
 * fix — every other module (password hashing, session tokens, the DB
 * schema, route guards) is framework-agnostic and does not depend on the
 * exact shape of these three calls.
 */

export const SESSION_COOKIE_NAME = "pixora_session";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days, mirrors SESSION_DURATION_MS

export function readSessionCookie(): string | undefined {
  return getCookie(SESSION_COOKIE_NAME);
}

export function writeSessionCookie(token: string): void {
  setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(): void {
  deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
}
