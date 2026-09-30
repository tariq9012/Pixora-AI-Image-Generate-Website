import { sql } from "drizzle-orm";

import { db } from "@/db/client.server";

export type DatabaseHealth = { ok: true; latencyMs: number } | { ok: false; error: string };

/**
 * Cheapest possible round trip to confirm the database is reachable.
 * Used by the /api/health endpoint; deliberately returns no schema or
 * connection details so it's safe to expose publicly.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const start = Date.now();

  try {
    await db.execute(sql`select 1`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}
