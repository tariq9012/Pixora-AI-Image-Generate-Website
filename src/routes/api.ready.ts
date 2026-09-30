import { createFileRoute } from "@tanstack/react-router";

import { checkDatabaseHealth } from "@/lib/health.server";

/**
 * PHASE 14: readiness probe — GET /api/ready.
 *
 * /api/health answers "is the process up and can it reach the database".
 * This answers "should traffic be routed here": it currently means the
 * database round-trip works. It returns only a coarse state — never the
 * database URL, driver messages, stack traces or which secrets are set.
 */
export const Route = createFileRoute("/api/ready")({
  server: {
    handlers: {
      GET: async () => {
        const database = await checkDatabaseHealth();

        return new Response(JSON.stringify({ status: database.ok ? "ready" : "not_ready" }), {
          status: database.ok ? 200 : 503,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
