import { createFileRoute } from "@tanstack/react-router";

import { checkDatabaseHealth } from "@/lib/health.server";

/**
 * A route with no `component` and only `server.handlers` acts as a plain
 * API endpoint — GET /api/health — instead of a page.
 *
 * (Previous version of this file used `createServerFileRoute` from
 * `@tanstack/react-start/server`, exported as `ServerRoute`. The dev
 * server warned "does not export a Route", confirming this project's
 * TanStack Router file-route scanner expects every route file — API or
 * page — to export a binding named `Route` from `createFileRoute`, with
 * server-only endpoints defined via the `server.handlers` option instead
 * of a `component`. This version matches that.)
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const database = await checkDatabaseHealth();

        return new Response(
          JSON.stringify({
            status: database.ok ? "ok" : "degraded",
            service: "pixora-api",
            database: database.ok ? "connected" : "unavailable",
            timestamp: new Date().toISOString(),
          }),
          {
            status: database.ok ? 200 : 503,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          },
        );
      },
    },
  },
});
