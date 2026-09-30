import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { billingIntervalEnum, subscriptionStatusEnum } from "./enums";
import { plans } from "./plans";
import { users } from "./users";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Billing history must survive account deletion for accounting/legal
    // reasons, so this is `restrict` rather than `cascade`.
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // A plan should not be deletable while subscriptions reference it.
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    provider: text("provider"),
    providerSubscriptionId: text("provider_subscription_id"),
    status: subscriptionStatusEnum("status").notNull().default("TRIALING"),
    billingInterval: billingIntervalEnum("billing_interval").notNull().default("MONTHLY"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    // PHASE 13 (billing): the Stripe event's own `created` timestamp for
    // whichever webhook last wrote this row's status/period fields — NOT
    // when we processed it. Stripe doesn't guarantee in-order delivery
    // (spec §63); comparing against this before applying a new
    // `customer.subscription.*` event stops a late-arriving stale event
    // from clobbering newer state. Null until the first webhook-driven
    // sync (a subscription can exist locally before that, e.g. moments
    // after Checkout, before `customer.subscription.updated` arrives).
    lastSyncedEventAt: timestamp("last_synced_event_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("subscriptions_user_id_idx").on(table.userId),
    planIdIdx: index("subscriptions_plan_id_idx").on(table.planId),
    statusIdx: index("subscriptions_status_idx").on(table.status),
    // PHASE 13: unique (not just indexed) — closes a race where two
    // near-simultaneous webhook events for a brand-new subscription
    // (e.g. `checkout.session.completed` and `customer.subscription.
    // created` arriving together) could otherwise both fail to find an
    // "existing" row and both INSERT. Nullable-unique is fine here for
    // the same reason as `users.stripeCustomerId`: Postgres treats every
    // NULL as distinct, so this never blocks inserting new subscriptions
    // that haven't been assigned a Stripe ID yet (not expected to happen
    // in practice, but not incorrect either).
    providerSubscriptionIdUniqueIdx: uniqueIndex(
      "subscriptions_provider_subscription_id_unique_idx",
    ).on(table.providerSubscriptionId),
  }),
);
