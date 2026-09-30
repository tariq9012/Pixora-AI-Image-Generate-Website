import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Runs outside of Vite (via `tsx`), so — unlike the app's dev/build
 * commands — nothing loads `.env` into `process.env` automatically here.
 * `dotenv/config` above does that; this then reads
 * `process.env.DATABASE_URL` directly instead of importing
 * `src/lib/env.server.ts`, which is meant for the app's Vite/Nitro
 * runtime, not a standalone CLI script.
 */
async function main() {
  const databaseUrl = process.env["DATABASE_URL"];

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations. Check your .env file.");
  }

  const migrationClient = postgres(databaseUrl, { max: 1, prepare: false });
  const db = drizzle(migrationClient);

  console.log("Running database migrations...");
  await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  console.log("Migrations completed successfully.");

  await migrationClient.end();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
