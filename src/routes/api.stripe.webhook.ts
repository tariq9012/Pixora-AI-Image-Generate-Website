import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";

import { env } from "@/lib/env.server";
import { getStripeClient, isStripeConfigured } from "@/lib/billing/stripe.server";
import { isHandledEventType, processStripeEvent } from "@/lib/billing/webhooks.server";
import {
  claimWebhookEvent,
  markWebhookEventFailed,
  markWebhookEventProcessed,
} from "@/lib/billing/webhook-events.server";

/**
 * PHASE 13: the ONLY place a payment can ever be marked paid or credits
 * granted (spec §18) — nothing else in this codebase does that. Public
 * by design (Stripe calls this with no Pixora session), authenticated
 * instead by verifying Stripe's own signature below.
 *
 * Route file pattern matches api.health.ts / api.assets.upload.ts: a
 * plain `server.handlers` object, raw web-standard `Request`/`Response`
 * — critically, `await request.text()` here reads the RAW body before
 * any JSON parsing happens, which is required for signature verification
 * (spec §19/§20 — Stripe signs the exact raw bytes it sent).
 */
export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isStripeConfigured() || !env.STRIPE_WEBHOOK_SECRET) {
          // Not configured — nothing to verify against. Refuse cleanly
          // rather than attempting to process an unverifiable payload.
          return json(503, { error: "Stripe is not configured." });
        }

        const signature = request.headers.get("stripe-signature");
        if (!signature) {
          return json(400, { error: "Missing stripe-signature header." });
        }

        const rawBody = await request.text();

        let event: Stripe.Event;
        try {
          event = getStripeClient().webhooks.constructEvent(
            rawBody,
            signature,
            env.STRIPE_WEBHOOK_SECRET,
          );
        } catch (error) {
          console.error("Stripe webhook signature verification failed:", error);
          return json(400, { error: "Invalid signature." });
        }

        // PHASE 14: never mix test and live. The secret key's prefix says
        // which mode this deployment is in; an event whose `livemode`
        // disagrees (e.g. a live event delivered to a test-key deployment,
        // or the reverse) is rejected before it can touch credits.
        const keyIsLive = /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY ?? "");
        if (event.livemode !== keyIsLive) {
          console.error(
            `Stripe event ${event.id} rejected: livemode=${String(event.livemode)} does not match the configured key mode.`,
          );
          return json(400, { error: "Event mode mismatch." });
        }

        if (!isHandledEventType(event.type)) {
          // Acknowledged, deliberately ignored — see webhooks.server.ts's
          // allowlist doc comment.
          return json(200, { received: true, handled: false });
        }

        const claim = await claimWebhookEvent(event.id, event.type);

        if (claim.outcome === "duplicate") {
          console.warn(`Stripe event ${event.id} (${event.type}) already processed — skipping.`);
          return json(200, { received: true, handled: false, reason: "duplicate" });
        }
        if (claim.outcome === "concurrent") {
          console.warn(
            `Stripe event ${event.id} (${event.type}) is being processed concurrently — skipping.`,
          );
          return json(200, { received: true, handled: false, reason: "concurrent" });
        }

        try {
          await processStripeEvent(event);
          await markWebhookEventProcessed(claim.rowId);
          console.log(`Stripe event ${event.id} (${event.type}) processed successfully.`);
          return json(200, { received: true, handled: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          console.error(`Stripe event ${event.id} (${event.type}) processing failed:`, error);
          await markWebhookEventFailed(claim.rowId, message);
          // Non-2xx so Stripe retries later — safe because every handler
          // in webhooks.server.ts is idempotent (spec §61).
          return json(500, { error: "Processing failed." });
        }
      },
    },
  },
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
