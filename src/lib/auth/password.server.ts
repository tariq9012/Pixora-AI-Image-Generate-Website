import bcrypt from "bcryptjs";

/**
 * bcryptjs (pure JS, no native/node-gyp bindings) rather than the `bcrypt`
 * or `argon2` native packages: this project has Cloudflare Workers/Wrangler
 * artifacts from earlier phases (see .gitignore), and native-addon password
 * hashers are unreliable or outright unsupported to bundle for edge
 * runtimes. bcryptjs gives the same bcrypt algorithm and hash format with
 * zero native-binding risk, at the cost of being somewhat slower in pure
 * Node — an acceptable tradeoff for an auth endpoint's request volume.
 *
 * bcrypt has a hard 72-byte input limit; MAX_PASSWORD_LENGTH in
 * src/lib/validation/auth.ts enforces that before it ever reaches here.
 */
const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
