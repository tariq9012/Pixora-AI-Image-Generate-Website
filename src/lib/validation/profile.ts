import { z } from "zod";

import { MAX_EMAIL_LENGTH } from "./auth";

const MAX_NAME_LENGTH = 100;
const MAX_BIO_LENGTH = 280;

// Reserved so a user can't claim a name that would collide with a route,
// system concept, or look like staff.
const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "root",
  "support",
  "help",
  "api",
  "auth",
  "login",
  "logout",
  "signup",
  "signin",
  "settings",
  "profile",
  "studio",
  "pixora",
  "system",
  "null",
  "undefined",
  "me",
  "you",
  "staff",
  "moderator",
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters.")
  .max(30, "Username is too long.")
  .regex(/^[a-z0-9_]+$/, "Usernames can only contain lowercase letters, numbers, and underscores.")
  .refine((value) => !RESERVED_USERNAMES.has(value), { message: "That username is reserved." });

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(MAX_NAME_LENGTH, "Name is too long."),
  username: usernameSchema,
  // Truly optional (no default): omitting it means "leave bio as-is" —
  // Settings' Account tab only edits name/username, while the Profile
  // page's edit dialog edits all three. If this defaulted to "", saving
  // from Settings would silently wipe out a bio set from Profile.
  bio: z
    .string()
    .trim()
    .max(MAX_BIO_LENGTH, `Bio must be ${MAX_BIO_LENGTH} characters or fewer.`)
    .optional(),
});

export const requestEmailChangeSchema = z.object({
  newEmail: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required.")
    .max(MAX_EMAIL_LENGTH, "Email is too long.")
    .email("Enter a valid email address."),
  currentPassword: z.string().min(1, "Current password is required."),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type RequestEmailChangeInput = z.infer<typeof requestEmailChangeSchema>;
