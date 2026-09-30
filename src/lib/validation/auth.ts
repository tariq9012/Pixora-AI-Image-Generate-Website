import { z } from "zod";

export const MAX_NAME_LENGTH = 100;
export const MAX_EMAIL_LENGTH = 254; // RFC 5321 practical limit
export const MIN_PASSWORD_LENGTH = 8;
// bcrypt silently ignores any bytes beyond 72 — reject upfront instead of
// letting a longer password get silently truncated.
export const MAX_PASSWORD_LENGTH = 72;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required.")
  .max(MAX_EMAIL_LENGTH, "Email is too long.")
  .email("Enter a valid email address.");

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, "Password is too long.");

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(MAX_NAME_LENGTH, "Name is too long."),
  email: emailSchema,
  password: passwordSchema,
  // Not collected by the current sign-up UI — reserved for when/if a
  // username field is added there.
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters.")
    .max(30, "Username is too long.")
    .regex(
      /^[a-z0-9_]+$/,
      "Usernames can only contain lowercase letters, numbers, and underscores.",
    )
    .optional(),
});

export const logInSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required.")
    .max(MAX_EMAIL_LENGTH, "Email is too long."),
  password: z.string().min(1, "Password is required.").max(MAX_PASSWORD_LENGTH),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required.")
    .max(MAX_EMAIL_LENGTH, "Email is too long."),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset link is invalid."),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: passwordSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type LogInInput = z.infer<typeof logInSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
