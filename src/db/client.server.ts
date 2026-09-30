import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env.server";

import * as schema from "./schema";

/**
 * Server-only database client. The `.server.ts` suffix ensures TanStack
 * Start's import-protection refuses to bundle this (and the `postgres`
 * driver + real DATABASE_URL it needs) into any client-side chunk.
 *
 * Cached on `globalThis` in development so Vite's HMR doesn't open a new
 * connection pool on every module reload.
 */
declare global {
  var __pixoraPgClient: ReturnType<typeof postgres> | undefined;
}

const client =
  globalThis.__pixoraPgClient ??
  postgres(env.DATABASE_URL, {
    // A few spare connections even in dev: if one gets closed out from
    // under us mid-request (see the pooled-connection note below), a
    // retry (src/lib/db-retry.server.ts) can grab a different, healthy
    // one immediately instead of waiting on the exact same slot to be
    // torn down and recreated.
    max: env.DB_POOL_MAX ?? (env.NODE_ENV === "production" ? 10 : 3),
    // Neon's pooled connection string (the "-pooler" host) runs PgBouncer
    // in transaction-pooling mode, which doesn't support session-level
    // prepared statements — postgres.js uses those by default.
    // RECOMMENDED: since this app manages its own connection pool
    // (via `max` above), point DATABASE_URL at Neon's DIRECT
    // (non-pooled) connection string instead of the "-pooler" one —
    // stacking postgres.js's pool on top of PgBouncer's is what's been
    // causing the "write CONNECTION_CLOSED" errors during longer flows
    // (e.g. Phase 6's generation pipeline: a DB write, then a
    // multi-second external AI call, then more DB writes). `prepare:
    // false` below is kept regardless, as cheap insurance if a pooled
    // string is ever used again. See https://neon.tech/docs/guides/postgres-js
    prepare: false,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });

if (env.NODE_ENV !== "production") {
  globalThis.__pixoraPgClient = client;
}

export const db = drizzle(client, { schema });

export type Database = typeof db;
export { schema };
