import { and, desc, eq, isNull, lte, or } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/db/client.server";
import { plans, subscriptions } from "@/db/schema";

import { resolvePlanSlugForPriceId } from "./plan-pricing.server";
import type { SubscriptionStatus } from "./types";

/**
 * Deliberate mapping (spec §31): Stripe has more granular statuses than
 * Pixora's existing `subscription_status` enum (TRIALING/ACTIVE/
 * PAST_DUE/CANCELLED/EXPIRED — unchanged this phase, see final report).
 * `incomplete`/`incomplete_expired` are folded into PAST_DUE/EXPIRED
 * respectively rather than getting a new enum value: with Checkout-first
 * subscriptions (payment collected up front, before the Subscription
 * object is even created), Stripe practically never returns
 * `incomplete` — it's a state that matters for API-created subscriptions
 * without an attached payment method, which this integration doesn't
 * do. Extending the enum for a path this integration cannot reach would
 * be schema churn without a corresponding behavior to test. `unpaid` maps
 * to PAST_DUE (still delinquent, not yet given up on) rather than
 * EXPIRED, which is reserved for `canceled` subscriptions past their
 * period end.
 */
function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "PAST_DUE";
    case "canceled":
      return "CANCELLED";
    case "incomplete_expired":
      return "EXPIRED";
    default:
      return "PAST_DUE";
  }
}

/**
 * Upserts the local `subscriptions` row from a Stripe Subscription
 * object, guarded against out-of-order webhook delivery (spec §63) via
 * `lastSyncedEventAt`: an incoming event whose own `created` timestamp is
 * older than what's already been applied is dropped rather than
 * clobbering newer state. Returns null (and applies nothing) if the
 * subscription's Price doesn't map to any locally-configured plan (spec
 * §47 — never activate a plan the actual purchased Price doesn't
 * verifiably correspond to).
 */
export async function upsertLocalSubscriptionFromStripe(
  userId: string,
  stripeSubscription: Stripe.Subscription,
  eventCreatedAt: Date,
): Promise<{ subscriptionId: string; planSlug: string } | null> {
  const priceId = stripeSubscription.items.data[0]?.price?.id;
  const planSlug = priceId ? resolvePlanSlugForPriceId(priceId) : null;
  if (!planSlug) {
    console.error(
      `Stripe subscription ${stripeSubscription.id} has an unrecognized Price ID (${priceId ?? "none"}) — refusing to activate any local plan for it.`,
    );
    return null;
  }

  const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.slug, planSlug));
  if (!plan) {
    console.error(`Resolved plan slug "${planSlug}" has no matching row in the local plans table.`);
    return null;
  }

  const interval =
    stripeSubscription.items.data[0]?.price?.recurring?.interval === "year" ? "YEARLY" : "MONTHLY";
  const status = mapStripeStatus(stripeSubscription.status);
  // Top-level fields on the Subscription object at the pinned API version
  // (2024-06-20) — later Stripe API versions moved these onto individual
  // subscription items instead; revisit this if STRIPE_API_VERSION is
  // ever bumped past that change.
  // Read the item-level fields too as a fallback: newer API versions
  // moved the billing period onto subscription items.
  const firstItem = stripeSubscription.items.data[0] as
    { current_period_start?: number; current_period_end?: number } | undefined;
  const currentPeriodStart =
    stripeSubscription.current_period_start ?? firstItem?.current_period_start;
  const currentPeriodEnd = stripeSubscription.current_period_end ?? firstItem?.current_period_end;

  const [existing] = await db
    .select({ id: subscriptions.id, lastSyncedEventAt: subscriptions.lastSyncedEventAt })
    .from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, stripeSubscription.id));

  const values = {
    userId,
    planId: plan.id,
    provider: "stripe",
    providerSubscriptionId: stripeSubscription.id,
    status,
    billingInterval: interval as "MONTHLY" | "YEARLY",
    currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart * 1000) : null,
    currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    lastSyncedEventAt: eventCreatedAt,
    updatedAt: new Date(),
  };

  if (!existing) {
    // The unique index on providerSubscriptionId is what actually
    // prevents a duplicate row under two genuinely concurrent first-sync
    // events (e.g. `checkout.session.completed` and `customer.
    // subscription.created` landing together for a brand-new
    // subscription) — this SELECT-then-INSERT is just the common-case
    // fast path.
    const inserted = await db
      .insert(subscriptions)
      .values(values)
      .onConflictDoNothing({ target: subscriptions.providerSubscriptionId })
      .returning({ id: subscriptions.id });

    if (inserted[0]) return { subscriptionId: inserted[0].id, planSlug };

    // Lost the race — someone else's insert landed first. Fall through
    // to the update path below against whatever they just created.
    const [raced] = await db
      .select({ id: subscriptions.id, lastSyncedEventAt: subscriptions.lastSyncedEventAt })
      .from(subscriptions)
      .where(eq(subscriptions.providerSubscriptionId, stripeSubscription.id));
    if (!raced)
      throw new Error("Failed to create or find local subscription row after insert conflict.");
    return applyIfNewer(raced, values, eventCreatedAt, planSlug);
  }

  return applyIfNewer(existing, values, eventCreatedAt, planSlug);
}

async function applyIfNewer(
  existing: { id: string; lastSyncedEventAt: Date | null },
  values: typeof subscriptions.$inferInsert,
  eventCreatedAt: Date,
  planSlug: string,
): Promise<{ subscriptionId: string; planSlug: string }> {
  if (existing.lastSyncedEventAt && existing.lastSyncedEventAt > eventCreatedAt) {
    // A newer event already applied — this one arrived late. Not an
    // error, just a no-op (spec §63).
    return { subscriptionId: existing.id, planSlug };
  }

  await db
    .update(subscriptions)
    .set(values)
    .where(
      and(
        eq(subscriptions.id, existing.id),
        // Atomic, SQL-level re-check of the same "don't apply a stale
        // event" guard already checked in JS above — closes the race
        // between that SELECT and this UPDATE for two genuinely
        // concurrent webhook deliveries.
        or(
          isNull(subscriptions.lastSyncedEventAt),
          lte(subscriptions.lastSyncedEventAt, eventCreatedAt),
        ),
      ),
    );

  return { subscriptionId: existing.id, planSlug };
}

/** Real current subscription for the account-shell / Credits page (spec
 * §57) — the most recent row regardless of status, so a cancelled/past
 * subscription still shows correctly rather than silently looking like
 * "no subscription ever existed". */
export async function getUserSubscription(userId: string) {
  const [row] = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      planName: plans.name,
      planSlug: plans.slug,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  return row ?? null;
}
