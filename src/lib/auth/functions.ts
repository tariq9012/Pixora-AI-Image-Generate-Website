import { createServerFn } from "@tanstack/react-start";

import {
  AuthError,
  changePassword,
  logInWithPassword,
  logOutCurrentSession,
  logoutAllOtherSessionsForUser,
  requestEmailChange,
  requestPasswordReset,
  resendVerificationEmailForUser,
  resetPasswordWithToken,
  signUpWithPassword,
  updateProfile,
  verifyEmailWithToken,
} from "./actions.server";
import { getOptionalUser, requireUser, requireUserWithSession } from "./guards.server";
import type { SessionUser } from "./types";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  logInSchema,
  resetPasswordSchema,
  signUpSchema,
} from "@/lib/validation/auth";
import { requestEmailChangeSchema, updateProfileSchema } from "@/lib/validation/profile";

/**
 * Thin `createServerFn` wrappers around the real logic in actions.server.ts
 * / guards.server.ts. Kept in a plain (non-`.server`) file because
 * `createServerFn`-wrapped functions are exactly what route files
 * (beforeLoad/loader/components, which run on both server and client) are
 * meant to import — the framework strips the actual handler body out of
 * the client bundle itself, so this file does not need the `.server.ts`
 * naming convention.
 *
 * `.validator()` calls `.parse()` explicitly (rather than passing the Zod
 * schema straight through) so this works regardless of whether this
 * TanStack Start version auto-detects Standard-Schema-compatible
 * validators.
 */

export type AuthActionResult =
  { success: true } | { success: false; code: string; message: string };

export type ProfileActionResult =
  { success: true; user: SessionUser } | { success: false; code: string; message: string };

function toActionResult(error: unknown, fallbackLog: string): AuthActionResult {
  if (error instanceof AuthError) {
    return { success: false, code: error.code, message: error.message };
  }
  console.error(fallbackLog, error);
  return {
    success: false,
    code: "INTERNAL_ERROR",
    message: "Something went wrong. Please try again.",
  };
}

export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(async () => {
  return getOptionalUser();
});

export const signUpFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => signUpSchema.parse(input))
  .handler(async ({ data }): Promise<AuthActionResult> => {
    try {
      await signUpWithPassword(data);
      return { success: true };
    } catch (error) {
      return toActionResult(error, "Sign-up failed:");
    }
  });

export const logInFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => logInSchema.parse(input))
  .handler(async ({ data }): Promise<AuthActionResult> => {
    try {
      await logInWithPassword(data);
      return { success: true };
    } catch (error) {
      return toActionResult(error, "Log-in failed:");
    }
  });

export const logOutFn = createServerFn({ method: "POST" }).handler(async () => {
  await logOutCurrentSession();
  return { success: true } as const;
});

export const verifyEmailFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "string" || input.length === 0) {
      throw new Error("A verification token is required.");
    }
    return input;
  })
  .handler(async ({ data: token }): Promise<AuthActionResult> => {
    try {
      await verifyEmailWithToken(token);
      return { success: true };
    } catch (error) {
      return toActionResult(error, "Email verification failed:");
    }
  });

export const resendVerificationFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<AuthActionResult> => {
    const user = await requireUser();
    try {
      await resendVerificationEmailForUser(user.id);
      return { success: true };
    } catch (error) {
      return toActionResult(error, "Resend verification failed:");
    }
  },
);

export const forgotPasswordFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => forgotPasswordSchema.parse(input))
  .handler(async ({ data }): Promise<AuthActionResult> => {
    try {
      await requestPasswordReset(data.email);
    } catch (error) {
      // Deliberately swallowed: per spec, forgot-password ALWAYS reports
      // success to the caller regardless of outcome, to avoid account
      // enumeration. Genuine failures are still logged server-side.
      console.error("Forgot-password failed:", error);
    }
    return { success: true };
  });

export const resetPasswordFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => resetPasswordSchema.parse(input))
  .handler(async ({ data }): Promise<AuthActionResult> => {
    try {
      await resetPasswordWithToken(data.token, data.password);
      return { success: true };
    } catch (error) {
      return toActionResult(error, "Reset-password failed:");
    }
  });

export const changePasswordFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => changePasswordSchema.parse(input))
  .handler(async ({ data }): Promise<AuthActionResult> => {
    const { user, sessionId } = await requireUserWithSession();
    try {
      await changePassword(user.id, sessionId, data.currentPassword, data.newPassword);
      return { success: true };
    } catch (error) {
      return toActionResult(error, "Change-password failed:");
    }
  });

export const updateProfileFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateProfileSchema.parse(input))
  .handler(async ({ data }): Promise<ProfileActionResult> => {
    const user = await requireUser();
    try {
      const updated = await updateProfile(user.id, data);
      return { success: true, user: updated };
    } catch (error) {
      return toActionResult(error, "Update-profile failed:") as ProfileActionResult;
    }
  });

export const requestEmailChangeFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => requestEmailChangeSchema.parse(input))
  .handler(async ({ data }): Promise<AuthActionResult> => {
    const user = await requireUser();
    try {
      await requestEmailChange(user.id, data);
      return { success: true };
    } catch (error) {
      return toActionResult(error, "Request-email-change failed:");
    }
  });

export const logoutAllOtherSessionsFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<AuthActionResult> => {
    const { user, sessionId } = await requireUserWithSession();
    try {
      await logoutAllOtherSessionsForUser(user.id, sessionId);
      return { success: true };
    } catch (error) {
      return toActionResult(error, "Logout-all-sessions failed:");
    }
  },
);
