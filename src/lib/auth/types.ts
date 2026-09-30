/**
 * Plain, JSON-safe shape of "the logged-in user" as seen by the rest of the
 * app (route context, components, server function responses). Deliberately
 * excludes passwordHash and anything session/token related — this is the
 * ONLY shape of a user that should ever leave the server boundary.
 *
 * `createdAt` is a string (not `Date`) on purpose: this value crosses the
 * server-function RPC boundary and, for routes, the SSR → client hydration
 * boundary. A plain ISO string survives both without depending on exactly
 * how rich a given serialization path is.
 */
export type UserRole = "USER" | "ADMIN" | "SUPER_ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "BANNED";

export type SessionUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
};
