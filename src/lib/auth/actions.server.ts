import { and, eq, ne, or } from "drizzle-orm";

import { db } from "@/db/client.server";
import { creditBalances, users } from "@/db/schema";
import { logAuditEvent } from "@/lib/audit.server";
import { sendPasswordResetEmail } from "@/lib/email/send-password-reset-email.server";
import { sendVerificationEmail } from "@/lib/email/send-verification-email.server";
import type { LogInInput, SignUpInput } from "@/lib/validation/auth";
import type { UpdateProfileInput, RequestEmailChangeInput } from "@/lib/validation/profile";

import { clearSessionCookie, readSessionCookie, writeSessionCookie } from "./cookies.server";
import { hashPassword, verifyPassword } from "./password.server";
import { checkRateLimit } from "./rate-limit.server";
import {
  createSession,
  invalidateAllUserSessions,
  invalidateOtherUserSessions,
  invalidateSession,
  toSessionUser,
  validateSessionToken,
} from "./session.server";
import type { SessionUser } from "./types";
import { consumeVerificationToken, issueVerificationToken } from "./verification.server";

export type AuthErrorCode =
  | "DUPLICATE_EMAIL"
  | "DUPLICATE_USERNAME"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_BANNED"
  | "RATE_LIMITED"
  | "INVALID_TOKEN"
  | "TOKEN_EXPIRED"
  | "TOKEN_ALREADY_USED"
  | "ALREADY_VERIFIED";

export class AuthError extends Error {
  code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

// Mirrors the Free plan's monthlyCredits in src/db/seed.ts. Hardcoded (not
// read from the `plans` table) since plan assignment isn't wired up yet —
// every new account starts on the implicit free tier.
const SIGNUP_STARTING_CREDITS = 50;

async function issueAndSendVerificationEmail(userId: string, email: string): Promise<void> {
  try {
    const token = await issueVerificationToken(userId, "EMAIL_VERIFICATION");
    await sendVerificationEmail(email, token);
  } catch (error) {
    // Per spec: a signup (or resend) must succeed even if email delivery
    // has a transient failure — the user can always request another link
    // once delivery is working again.
    console.error("Failed to send verification email:", error);
  }
}

export async function signUpWithPassword(input: SignUpInput): Promise<SessionUser> {
  const email = input.email.trim().toLowerCase();

  const rateLimit = checkRateLimit(`signup:${email}`, { max: 5, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) {
    throw new AuthError("RATE_LIMITED", "Too many attempts. Please try again later.");
  }

  const existing = await db
    .select({ id: users.id, email: users.email, username: users.username })
    .from(users)
    .where(
      input.username
        ? or(eq(users.email, email), eq(users.username, input.username))
        : eq(users.email, email),
    );

  if (existing.some((row) => row.email === email)) {
    throw new AuthError("DUPLICATE_EMAIL", "An account with this email already exists.");
  }
  if (input.username && existing.some((row) => row.username === input.username)) {
    throw new AuthError("DUPLICATE_USERNAME", "That username is already taken.");
  }

  const passwordHash = await hashPassword(input.password);

  const createdUser = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        email,
        name: input.name.trim(),
        username: input.username ?? null,
        passwordHash,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create user.");
    }

    await tx
      .insert(creditBalances)
      .values({ userId: created.id, balance: SIGNUP_STARTING_CREDITS });

    return created;
  });

  const { token } = await createSession(createdUser.id);
  writeSessionCookie(token);

  // Best-effort: signup succeeds regardless of whether this send works.
  await issueAndSendVerificationEmail(createdUser.id, createdUser.email);

  return toSessionUser(createdUser);
}

export async function logInWithPassword(input: LogInInput): Promise<SessionUser> {
  const email = input.email.trim().toLowerCase();

  const rateLimit = checkRateLimit(`login:${email}`, { max: 10, windowMs: 15 * 60 * 1000 });
  if (!rateLimit.allowed) {
    throw new AuthError("RATE_LIMITED", "Too many attempts. Please try again later.");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));

  // Deliberately generic message for both "no such user" and "wrong
  // password" — never let a login error confirm whether an email exists.
  if (!user) {
    throw new AuthError("INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const passwordHash = user.passwordHash;
  if (!passwordHash) {
    throw new AuthError("INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const validPassword = await verifyPassword(input.password, passwordHash);
  if (!validPassword) {
    throw new AuthError("INVALID_CREDENTIALS", "Invalid email or password.");
  }

  if (user.status === "BANNED") {
    throw new AuthError("ACCOUNT_BANNED", "This account has been banned.");
  }
  if (user.status === "SUSPENDED") {
    throw new AuthError("ACCOUNT_SUSPENDED", "This account is currently suspended.");
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const { token } = await createSession(user.id);
  writeSessionCookie(token);

  return toSessionUser(user);
}

export async function logOutCurrentSession(): Promise<void> {
  const token = readSessionCookie();
  clearSessionCookie();

  if (!token) return;

  const result = await validateSessionToken(token);
  if (result) {
    await invalidateSession(result.sessionId);
  }
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

/**
 * Handles BOTH "verify the email I signed up with" and "confirm an email
 * change" through the same EMAIL_VERIFICATION token purpose: if the
 * account has a `pendingEmail` set (see requestEmailChange), completing
 * verification promotes it to `email` and clears the pending slot instead
 * of just flipping `emailVerified` on the current address.
 */
export async function verifyEmailWithToken(rawToken: string): Promise<SessionUser> {
  const result = await consumeVerificationToken(rawToken, "EMAIL_VERIFICATION");

  if (!result.ok) {
    const code =
      result.reason === "EXPIRED"
        ? "TOKEN_EXPIRED"
        : result.reason === "ALREADY_USED"
          ? "TOKEN_ALREADY_USED"
          : "INVALID_TOKEN";
    throw new AuthError(code, "This verification link is invalid or has expired.");
  }

  const [user] = await db.select().from(users).where(eq(users.id, result.userId));
  if (!user) {
    throw new AuthError("INVALID_TOKEN", "This verification link is invalid or has expired.");
  }

  if (user.pendingEmail) {
    // Completing an email CHANGE. Re-check uniqueness now in case someone
    // else claimed the address between the request and this confirmation.
    const [conflict] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, user.pendingEmail), ne(users.id, user.id)));

    if (conflict) {
      throw new AuthError("DUPLICATE_EMAIL", "That email is now used by another account.");
    }

    const [updated] = await db
      .update(users)
      .set({ email: user.pendingEmail, pendingEmail: null, emailVerified: new Date() })
      .where(eq(users.id, user.id))
      .returning();

    if (!updated) {
      throw new Error("Failed to update email.");
    }

    await logAuditEvent({
      actorUserId: user.id,
      action: "EMAIL_CHANGED",
      entityType: "user",
      entityId: user.id,
    });

    return toSessionUser(updated);
  }

  const [updated] = await db
    .update(users)
    .set({ emailVerified: new Date() })
    .where(eq(users.id, user.id))
    .returning();

  if (!updated) {
    throw new Error("Failed to update email verification status.");
  }

  await logAuditEvent({
    actorUserId: user.id,
    action: "EMAIL_VERIFIED",
    entityType: "user",
    entityId: user.id,
  });

  return toSessionUser(updated);
}

export async function resendVerificationEmailForUser(userId: string): Promise<void> {
  const rateLimit = checkRateLimit(`resend-verification:${userId}`, {
    max: 3,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    throw new AuthError("RATE_LIMITED", "Too many attempts. Please try again later.");
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    throw new AuthError("INVALID_TOKEN", "Account not found.");
  }

  const target = user.pendingEmail ?? user.email;

  if (!user.pendingEmail && user.emailVerified) {
    throw new AuthError("ALREADY_VERIFIED", "This email address is already verified.");
  }

  await issueAndSendVerificationEmail(user.id, target);
}

// ---------------------------------------------------------------------------
// Forgot / reset password
// ---------------------------------------------------------------------------

/**
 * Always resolves successfully from the CALLER's point of view — whether
 * or not an account exists for `email` is never observable from the
 * return value (see the server function wrapper for the generic message
 * every case shares).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  const rateLimit = checkRateLimit(`forgot-password:${normalizedEmail}`, {
    max: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.allowed) return; // fail closed, but silently — no enumeration signal either way

  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));
  if (!user || !user.passwordHash) return; // no account, or a future OAuth-only account
  if (user.status === "BANNED") return;

  try {
    const token = await issueVerificationToken(user.id, "PASSWORD_RESET");
    await sendPasswordResetEmail(user.email, token);
  } catch (error) {
    console.error("Failed to send password reset email:", error);
  }
}

export async function resetPasswordWithToken(rawToken: string, newPassword: string): Promise<void> {
  const result = await consumeVerificationToken(rawToken, "PASSWORD_RESET");

  if (!result.ok) {
    const code =
      result.reason === "EXPIRED"
        ? "TOKEN_EXPIRED"
        : result.reason === "ALREADY_USED"
          ? "TOKEN_ALREADY_USED"
          : "INVALID_TOKEN";
    throw new AuthError(code, "This reset link is invalid or has expired.");
  }

  const passwordHash = await hashPassword(newPassword);

  await db.update(users).set({ passwordHash }).where(eq(users.id, result.userId));

  // A password reset is a strong signal the previous credentials may have
  // been compromised — kill every existing session unconditionally.
  await invalidateAllUserSessions(result.userId);

  await logAuditEvent({
    actorUserId: result.userId,
    action: "PASSWORD_RESET_COMPLETED",
    entityType: "user",
    entityId: result.userId,
  });
}

// ---------------------------------------------------------------------------
// Authenticated account management
// ---------------------------------------------------------------------------

export async function changePassword(
  userId: string,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.passwordHash) {
    throw new AuthError("INVALID_CREDENTIALS", "Current password is incorrect.");
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    throw new AuthError("INVALID_CREDENTIALS", "Current password is incorrect.");
  }

  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

  // Keep the session the request came in on; kill every other one.
  await invalidateOtherUserSessions(userId, currentSessionId);

  await logAuditEvent({
    actorUserId: userId,
    action: "PASSWORD_CHANGED",
    entityType: "user",
    entityId: userId,
  });
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<SessionUser> {
  const [conflict] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, input.username), ne(users.id, userId)));

  if (conflict) {
    throw new AuthError("DUPLICATE_USERNAME", "That username is already taken.");
  }

  const [updated] = await db
    .update(users)
    .set({
      name: input.name,
      username: input.username,
      // Only touch bio when the caller actually sent one (see the comment
      // on updateProfileSchema's `bio` field for why this can't default).
      ...(input.bio !== undefined ? { bio: input.bio || null } : {}),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    throw new Error("Failed to update profile.");
  }

  await logAuditEvent({
    actorUserId: userId,
    action: "PROFILE_UPDATED",
    entityType: "user",
    entityId: userId,
  });

  return toSessionUser(updated);
}

export async function requestEmailChange(
  userId: string,
  input: RequestEmailChangeInput,
): Promise<void> {
  const newEmail = input.newEmail.trim().toLowerCase();

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.passwordHash) {
    throw new AuthError("INVALID_CREDENTIALS", "Current password is incorrect.");
  }

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) {
    throw new AuthError("INVALID_CREDENTIALS", "Current password is incorrect.");
  }

  if (newEmail === user.email) {
    throw new AuthError("DUPLICATE_EMAIL", "That's already your current email.");
  }

  const [conflict] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, newEmail), ne(users.id, userId)));

  if (conflict) {
    throw new AuthError("DUPLICATE_EMAIL", "That email is already in use.");
  }

  await db.update(users).set({ pendingEmail: newEmail }).where(eq(users.id, userId));

  await logAuditEvent({
    actorUserId: userId,
    action: "EMAIL_CHANGE_REQUESTED",
    entityType: "user",
    entityId: userId,
  });

  await issueAndSendVerificationEmail(userId, newEmail);
}

export async function logoutAllOtherSessionsForUser(
  userId: string,
  currentSessionId: string,
): Promise<void> {
  await invalidateOtherUserSessions(userId, currentSessionId);

  await logAuditEvent({
    actorUserId: userId,
    action: "LOGOUT_ALL_SESSIONS",
    entityType: "user",
    entityId: userId,
  });
}
