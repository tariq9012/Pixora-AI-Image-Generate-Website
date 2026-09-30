import { and, eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { stripeWebhookEvents } from "@/db/schema";

export type ClaimResult =
  { outcome: "claimed"; rowId: string } | { outcome: "duplicate" } | { outcome: "concurrent" };

/**
 * Attempts to claim exclusive processing rights for one Stripe event ID.
 * See stripe-webhook-events.ts's schema doc comment for the full state
 * machine this implements. Every branch here is a plain, atomic SQL
 * statement — no explicit row locks needed, so this is safe across
 * multiple server instances, not just multiple requests on one process.
 */
export async function claimWebhookEvent(stripeEventId: string, type: string): Promise<ClaimResult> {
  const inserted = await db
    .insert(stripeWebhookEvents)
    .values({ stripeEventId, type, status: "PROCESSING" })
    .onConflictDoNothing({ target: stripeWebhookEvents.stripeEventId })
    .returning({ id: stripeWebhookEvents.id });

  if (inserted[0]) return { outcome: "claimed", rowId: inserted[0].id };

  // A row already existed — find out which state it's in.
  const [existing] = await db
    .select({ id: stripeWebhookEvents.id, status: stripeWebhookEvents.status })
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.stripeEventId, stripeEventId));

  if (!existing) {
    // Vanishingly unlikely (would mean the row was deleted between our
    // insert-conflict and this read) — treat as "someone else has it".
    return { outcome: "concurrent" };
  }

  if (existing.status === "PROCESSED") return { outcome: "duplicate" };
  if (existing.status === "PROCESSING") return { outcome: "concurrent" };

  // status === "FAILED": a previous attempt failed (we returned a
  // non-2xx and Stripe is retrying, or this is a manual replay). Only
  // ONE concurrent retrier can win this conditional flip back to
  // "PROCESSING" — the WHERE clause makes it atomic.
  const reclaimed = await db
    .update(stripeWebhookEvents)
    .set({ status: "PROCESSING", error: null })
    .where(and(eq(stripeWebhookEvents.id, existing.id), eq(stripeWebhookEvents.status, "FAILED")))
    .returning({ id: stripeWebhookEvents.id });

  if (reclaimed[0]) return { outcome: "claimed", rowId: reclaimed[0].id };
  // Someone else reclaimed it a moment before we did.
  return { outcome: "concurrent" };
}

export async function markWebhookEventProcessed(rowId: string): Promise<void> {
  await db
    .update(stripeWebhookEvents)
    .set({ status: "PROCESSED", processedAt: new Date(), error: null })
    .where(eq(stripeWebhookEvents.id, rowId));
}

/** `error` must already be a safe, short summary — never a raw Stripe
 * payload or full stack trace (spec §60/§66). */
export async function markWebhookEventFailed(rowId: string, error: string): Promise<void> {
  await db
    .update(stripeWebhookEvents)
    .set({ status: "FAILED", error: error.slice(0, 500) })
    .where(eq(stripeWebhookEvents.id, rowId));
}
