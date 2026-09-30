import { redirect } from "@tanstack/react-router";

import type { SessionUser } from "./types";

/**
 * Pure helpers for a route's `beforeLoad`. Unlike guards.server.ts, these
 * take the ALREADY-RESOLVED `context.user` (populated once, at the root
 * route — see src/routes/__root.tsx) instead of hitting the database
 * themselves, so protecting N nested routes costs one session lookup per
 * navigation, not N. They are safe to import from ordinary (non-`.server`)
 * route files because they touch no secrets and make no I/O — they only
 * decide whether to throw a `redirect()`.
 */

function isSafeRedirectTarget(path: string): boolean {
  // Only ever redirect back to a same-site, absolute path — never an
  // absolute URL or protocol-relative path (open-redirect prevention).
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}

export { isSafeRedirectTarget };

export function safeRedirectSearch(path: string): { redirect: string } | undefined {
  return isSafeRedirectTarget(path) ? { redirect: path } : undefined;
}

/** Throws if there is no active, non-suspended/banned user. */
export function requireAuthenticatedUser(
  user: SessionUser | null,
  currentPath: string,
): SessionUser {
  if (!user) {
    throw redirect({ to: "/login", search: safeRedirectSearch(currentPath) ?? {} });
  }

  if (user.status === "BANNED") {
    throw redirect({ to: "/login", search: { error: "account_banned" } });
  }

  if (user.status === "SUSPENDED") {
    throw redirect({ to: "/login", search: { error: "account_suspended" } });
  }

  return user;
}

/** Throws unless the user is ADMIN or SUPER_ADMIN. */
export function requireAdminUser(user: SessionUser | null, currentPath: string): SessionUser {
  const activeUser = requireAuthenticatedUser(user, currentPath);

  if (activeUser.role !== "ADMIN" && activeUser.role !== "SUPER_ADMIN") {
    throw redirect({ to: "/studio" });
  }

  return activeUser;
}

/** For /login and /signup: bounce an already-logged-in user to /studio. */
export function redirectIfAuthenticated(user: SessionUser | null, to = "/studio"): void {
  if (user && user.status === "ACTIVE") {
    throw redirect({ to });
  }
}
