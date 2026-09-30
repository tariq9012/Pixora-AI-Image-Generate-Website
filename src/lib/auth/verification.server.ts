import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client.server";
import { verificationTokens } from "@/db/schema";

import { generateRandomToken, hashToken } from "./crypto.server";

export const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
export const PASSWORD_RESET_TTL_MS = 1000 * 60 * 45; // 45 minutes

export type TokenPurpose = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

/**
 * Invalidates (marks consumed) any still-active token of this purpose for
 * this user, then issues a fresh one. Called before every new token so a
 * user only ever has one live verification/reset link outstanding —
 * requesting a new one silently kills the old one instead of leaving both
 * usable.
 */
export async function issueVerificationToken(
  userId: string,
  purpose: TokenPurpose,
): Promise<string> {
  const ttlMs =
    purpose === "EMAIL_VERIFICATION" ? EMAIL_VERIFICATION_TTL_MS : PASSWORD_RESET_TTL_MS;
  const token = generateRandomToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlMs);

  await invalidateActiveTokensForUser(userId, purpose);
  await db.insert(verificationTokens).values({ userId, tokenHash, purpose, expiresAt });

  return token;
}

export async function invalidateActiveTokensForUser(
  userId: string,
  purpose: TokenPurpose,
): Promise<void> {
  await db
    .update(verificationTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(verificationTokens.userId, userId),
        eq(verificationTokens.purpose, purpose),
        isNull(verificationTokens.consumedAt),
      ),
    );
}

export type ConsumeTokenResult =
  { ok: true; userId: string } | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "ALREADY_USED" };

/**
 * Looks up a token by its hash and, if valid, marks it consumed in the
 * same operation before reporting success. The final UPDATE is scoped to
 * `consumedAt IS NULL`, so if two requests race on the same raw token only
 * one UPDATE can ever match a row — the loser correctly gets
 * ALREADY_USED instead of both succeeding.
 */
export async function consumeVerificationToken(
  rawToken: string,
  purpose: TokenPurpose,
): Promise<ConsumeTokenResult> {
  const tokenHash = hashToken(rawToken);

  const [row] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(eq(verificationTokens.tokenHash, tokenHash), eq(verificationTokens.purpose, purpose)),
    );

  if (!row) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  if (row.consumedAt) {
    return { ok: false, reason: "ALREADY_USED" };
  }

  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "EXPIRED" };
  }

  const [updated] = await db
    .update(verificationTokens)
    .set({ consumedAt: new Date() })
    .where(and(eq(verificationTokens.id, row.id), isNull(verificationTokens.consumedAt)))
    .returning({ id: verificationTokens.id });

  if (!updated) {
    return { ok: false, reason: "ALREADY_USED" };
  }

  return { ok: true, userId: row.userId };
}
