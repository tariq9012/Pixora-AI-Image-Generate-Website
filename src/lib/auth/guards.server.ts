import { redirect } from "@tanstack/react-router";

import { readSessionCookie } from "./cookies.server";
import { validateSessionToken } from "./session.server";
import type { SessionUser, UserRole } from "./types";

/**
 * Reusable server-side authorization primitives. These are for protecting
 * SERVER FUNCTIONS / future mutations directly (defense in depth) — a
 * client could in principle call a server function without ever going
 * through a route's `beforeLoad`, so route-level guards
 * (src/lib/auth/route-guards.ts) are not suffient on their own.
 *
 * `requireUser`/`requireAdmin`/`requireRole` throw a TanStack Router
 * `redirect()` rather than returning null/false, so a protected server
 * function can just `const user = await requireUser()` at the top without
 * extra branching — an unauthorized caller never reaches the rest of the
 * handler.
 */

export async function getOptionalUserWithSession(): Promise<{
  user: SessionUser;
  sessionId: string;
} | null> {
  const token = readSessionCookie();
  if (!token) return null;

  return validateSessionToken(token);
}

export async function getOptionalUser(): Promise<SessionUser | null> {
  const result = await getOptionalUserWithSession();
  return result?.user ?? null;
}

export async function requireUserWithSession(): Promise<{
  user: SessionUser;
  sessionId: string;
}> {
  const result = await getOptionalUserWithSession();

  if (!result) {
    throw redirect({ to: "/login" });
  }

  if (result.user.status === "BANNED") {
    throw redirect({ to: "/login", search: { error: "account_banned" } });
  }

  if (result.user.status === "SUSPENDED") {
    throw redirect({ to: "/login", search: { error: "account_suspended" } });
  }

  return result;
}

export async function requireUser(): Promise<SessionUser> {
  const { user } = await requireUserWithSession();
  return user;
}

export async function requireRole(roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();

  if (!roles.includes(user.role)) {
    throw redirect({ to: "/studio" });
  }

  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireRole(["ADMIN", "SUPER_ADMIN"]);
}
