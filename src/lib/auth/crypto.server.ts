import { createHash, randomBytes } from "node:crypto";

/**
 * A high-entropy, URL-safe random token. Used as the raw session cookie
 * value (and reusable later for email-verification / password-reset
 * tokens) — never stored in the database directly, only its hash (see
 * `hashToken`).
 */
export function generateRandomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

/**
 * Deterministic, fast hash for tokens that are ALREADY high-entropy random
 * values (session tokens, verification tokens) so they can be looked up by
 * equality in the database. This is intentionally NOT a slow password
 * hash (bcrypt/argon2/scrypt) — those are for low-entropy human passwords
 * and would make every session-validated request unnecessarily slow. A
 * database leak of these hashes is not useful to an attacker without also
 * knowing (or brute-forcing) the original 256-bit random token.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
