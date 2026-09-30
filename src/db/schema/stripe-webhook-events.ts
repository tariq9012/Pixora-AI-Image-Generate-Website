import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { stripeWebhookEventStatusEnum } from "./enums";

/**
 * PHASE 13 (billing): idempotency ledger for Stripe webhook events.
 * Non-negotiable per spec — Stripe may (and will) redeliver the same
 * event, and this must survive process restarts / multiple server
 * instances, so it cannot be an in-memory Set.
 *
 * Usage pattern (see billing/webhook-events.server.ts):
 *  1. On receipt, try to INSERT (stripeEventId, type, status:"PROCESSING")
 *     with `ON CONFLICT (stripe_event_id) DO NOTHING`.
 *  2. Zero rows inserted -> a row already exists. If its status is
 *     "PROCESSED", this is a genuine duplicate delivery: no-op, return
 *     200. If "FAILED", atomically flip it back to "PROCESSING" (only if
 *     it's still "FAILED") and retry business logic. If "PROCESSING",
 *     another request is concurrently handling this exact event: no-op,
 *     return 200 (Stripe will redeliver later if that concurrent attempt
 *     genuinely fails).
 *  3. A row WAS inserted -> this request owns processing; run business
 *     logic, then update to "PROCESSED" (success) or "FAILED" (error, and
 *     return a non-2xx so Stripe retries).
 *
 * Kept intentionally lean (spec §66): enough to debug and deduplicate,
 * not a full copy of every Stripe payload.
 */
export const stripeWebhookEvents = pgTable(
  "stripe_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stripeEventId: text("stripe_event_id").notNull(),
    type: text("type").notNull(),
    status: stripeWebhookEventStatusEnum("status").notNull().default("PROCESSING"),
    // Safe, short error summary only — never a full stack trace or raw
    // Stripe payload (spec §60/§66).
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => ({
    stripeEventIdUniqueIdx: uniqueIndex("stripe_webhook_events_stripe_event_id_unique_idx").on(
      table.stripeEventId,
    ),
    statusIdx: index("stripe_webhook_events_status_idx").on(table.status),
  }),
);
