import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db/client.server";
import { sessions, users } from "@/db/schema";

import { generateRandomToken, hashToken } from "./crypto.server";
import type { SessionUser } from "./types";

export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function toSessionUser(row: typeof users.$inferSelect): SessionUser {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified !== null,
    name: row.name,
    username: row.username,
    avatarUrl: row.avatarUrl,
    bio: row.bio,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Creates a session row and returns the RAW token. The raw token is what
 * goes in the cookie; only its hash is ever persisted (see
 * src/lib/auth/crypto.server.ts).
 */
export async function createSession(userId: string): Promise<{ token: string; sessionId: string }> {
  const token = generateRandomToken();
  const sessionTokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const [session] = await db
    .insert(sessions)
    .values({ userId, sessionTokenHash, expiresAt })
    .returning({ id: sessions.id });

  if (!session) {
    throw new Error("Failed to create session.");
  }

  return { token, sessionId: session.id };
}

/**
 * Looks up a session by the raw cookie token, transparently expiring (and
 * deleting) it if past `expiresAt`. Returns null for anything invalid —
 * callers should treat "not found" and "expired" identically, both mean
 * "not logged in".
 */
export async function validateSessionToken(
  token: string,
): Promise<{ user: SessionUser; sessionId: string } | null> {
  const sessionTokenHash = hashToken(token);

  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.sessionTokenHash, sessionTokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }

  return { user: toSessionUser(row.user), sessionId: row.sessionId };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Used by "log out of all other devices" and by password change/reset —
 * keeps the session the caller is currently using intact while killing
 * every other one for that user.
 */
export async function invalidateOtherUserSessions(
  userId: string,
  exceptSessionId: string,
): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId)));
}
