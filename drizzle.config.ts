import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// dotenv/config above guarantees DATABASE_URL is populated from .env
// regardless of whether this specific drizzle-kit version's own auto-load
// behavior applies to the command being run (e.g. `generate` vs `push`).
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] as string,
  },
  strict: true,
  verbose: true,
});
