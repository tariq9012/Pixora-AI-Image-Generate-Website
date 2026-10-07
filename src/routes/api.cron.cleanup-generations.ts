import { createFileRoute } from "@tanstack/react-router";

import {
  cleanupStaleGenerations,
  reconcileTimedOutGenerationRefunds,
} from "@/lib/ai/cleanup.server";
import { env } from "@/lib/env.server";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth.server";

/**
 * PHASE 14B: scheduled cleanup of stranded generations. Machine-to-machine:
 * no Pixora session, no Origin/CSRF check (the CSRF middleware in
 * src/start.ts only covers server functions). Protected by
 * `Authorization: Bearer <CRON_SECRET>`.
 *
 * Vercel Cron invokes this with GET; POST is accepted for manual runs.
 * Safe to call repeatedly and concurrently — see cleanup.server.ts.
 */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function handle({ request }: { request: Request }): Promise<Response> {
  if (!env.CRON_SECRET) {
    return json(503, { ok: false, error: "Cron endpoint is not configured." });
  }

  if (!isAuthorizedCronRequest(request)) {
    return json(401, { ok: false, error: "Unauthorized." });
  }

  try {
    const cleanup = await cleanupStaleGenerations();
    const reconcile = await reconcileTimedOutGenerationRefunds();

    return json(200, {
      ok: true,
      scanned: cleanup.scanned,
      claimed: cleanup.claimed,
      skipped: cleanup.skipped,
      refunded: cleanup.refunded + reconcile.refunded,
      refundFailed: cleanup.refundFailed + reconcile.refundFailed,
      reconciled: reconcile.refunded,
    });
  } catch (error) {
    console.error("[generation-cleanup] run failed:", error);
    return json(500, { ok: false, error: "Cleanup failed." });
  }
}

export const Route = createFileRoute("/api/cron/cleanup-generations")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});
