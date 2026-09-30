import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import bcrypt from "bcryptjs";
import postgres from "postgres";

import * as schema from "./schema";

const SALT_ROUNDS = 12;

/**
 * Deliberately NOT part of seed.ts and NOT run automatically anywhere.
 * Requires real credentials to be supplied explicitly every time, so
 * there is no hardcoded admin password anywhere in the repo that could
 * end up used in production.
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... [ADMIN_NAME="..."] \
 *     [ADMIN_ROLE=ADMIN|SUPER_ADMIN] npm run db:create-admin
 *
 * Safe to re-run: if the email already exists, it promotes that account
 * to the given role and resets its password instead of erroring.
 */
async function main() {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Check your .env file.");
  }

  const email = process.env["ADMIN_EMAIL"]?.trim().toLowerCase();
  const password = process.env["ADMIN_PASSWORD"];
  const name = process.env["ADMIN_NAME"]?.trim() || "Admin";
  const role = process.env["ADMIN_ROLE"] ?? "ADMIN";

  if (!email || !password) {
    console.error(
      'Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... [ADMIN_NAME="..."] ' +
        "[ADMIN_ROLE=ADMIN|SUPER_ADMIN] npm run db:create-admin",
    );
    process.exit(1);
  }

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters.");
  }

  if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
    throw new Error('ADMIN_ROLE must be "ADMIN" or "SUPER_ADMIN".');
  }

  const client = postgres(databaseUrl, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));

  if (existing) {
    await db
      .update(schema.users)
      .set({ passwordHash, role, name, status: "ACTIVE" })
      .where(eq(schema.users.id, existing.id));
    console.log(`Updated existing user ${email} to role ${role}.`);
  } else {
    const [created] = await db
      .insert(schema.users)
      .values({ email, name, passwordHash, role, emailVerified: new Date() })
      .returning({ id: schema.users.id });

    if (created) {
      await db.insert(schema.creditBalances).values({ userId: created.id, balance: 50 });
    }
    console.log(`Created admin user ${email} with role ${role}.`);
  }

  await client.end();
}

main().catch((error) => {
  console.error("Failed to create admin:", error);
  process.exit(1);
});
