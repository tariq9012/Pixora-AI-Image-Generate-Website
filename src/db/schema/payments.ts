import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { paymentStatusEnum, paymentTypeEnum } from "./enums";
import { subscriptions } from "./subscriptions";
import { users } from "./users";

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Financial records must never disappear via cascade — `restrict`
    // forces an explicit decision (anonymize, archive, etc.) instead of a
    // silent delete.
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    provider: text("provider"),
    providerPaymentId: text("provider_payment_id"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    status: paymentStatusEnum("status").notNull().default("PENDING"),
    type: paymentTypeEnum("type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("payments_user_id_idx").on(table.userId),
    subscriptionIdIdx: index("payments_subscription_id_idx").on(table.subscriptionId),
    statusIdx: index("payments_status_idx").on(table.status),
    // PHASE 13: promoted from a plain index to UNIQUE — this is the
    // idempotency key `payments.server.ts` relies on via
    // `onConflictDoNothing({ target: providerPaymentId })` for renewal
    // invoices (one Stripe Invoice ID must produce at most one payment
    // row, no matter how many times its webhook is redelivered), and
    // Postgres requires a real unique constraint/index for `ON CONFLICT`
    // to target a column at all — a plain index isn't sufficient at the
    // database level. Nullable-unique, same reasoning as
    // `users.stripeCustomerId`.
    providerPaymentIdUniqueIdx: uniqueIndex("payments_provider_payment_id_unique_idx").on(
      table.providerPaymentId,
    ),
  }),
);
