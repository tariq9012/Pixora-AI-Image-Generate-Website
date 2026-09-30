import { sql } from "drizzle-orm";
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

import { creditTransactionTypeEnum } from "./enums";
import { generations } from "./generations";
import { payments } from "./payments";
import { users } from "./users";

/**
 * Fast-read cache of "how many credits does this user have right now".
 * This is derived data — it must only ever be updated by summing/applying
 * `creditTransactions`, never edited directly. It exists purely so reading
 * a balance doesn't require aggregating the whole ledger on every request.
 */
export const creditBalances = pgTable("credit_balances", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The source of truth for all credit movement. Append-only by design:
 * application code should only ever INSERT here, never UPDATE/DELETE a
 * row. Corrections are made with a new offsetting transaction (e.g. a
 * REFUND row), not by editing history. `restrict` on userId keeps this
 * ledger intact even if a user account is later removed.
 */
export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // Positive = credits added (purchase, bonus, refund), negative = spent.
    amount: integer("amount").notNull(),
    type: creditTransactionTypeEnum("type").notNull(),
    description: text("description"),
    generationId: uuid("generation_id").references(() => generations.id, {
      onDelete: "set null",
    }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("credit_transactions_user_id_idx").on(table.userId),
    typeIdx: index("credit_transactions_type_idx").on(table.type),
    generationIdIdx: index("credit_transactions_generation_id_idx").on(table.generationId),
    createdAtIdx: index("credit_transactions_created_at_idx").on(table.createdAt),
    // PHASE 13: UNIQUE (not just indexed) — this is what makes
    // billing/credit-grants.server.ts's "grant credits for this payment
    // exactly once" promise absolute at the database level rather than
    // only "very likely" via an application-level check-then-insert.
    // Webhook deliveries are Stripe's explicit at-least-once retry
    // contract, so this specific path is held to a stricter standard
    // than the pre-existing generation-refund path below it, which isn't
    // touched this phase. Nullable-unique: only PURCHASE/SUBSCRIPTION
    // rows ever set `paymentId`; every other transaction type leaves it
    // null, and Postgres allows unlimited NULLs in a unique index.
    paymentIdUniqueIdx: uniqueIndex("credit_transactions_payment_id_unique_idx").on(
      table.paymentId,
    ),
    // PHASE 14: at most one REFUND ledger row per generation, enforced by
    // the database. Makes generation refunds exactly-once even under
    // concurrent failure handling (see refundCreditsIfNotAlready).
    generationRefundUniqueIdx: uniqueIndex("credit_transactions_generation_refund_unique_idx")
      .on(table.generationId)
      .where(sql`${table.type} = 'REFUND'`),
  }),
);
