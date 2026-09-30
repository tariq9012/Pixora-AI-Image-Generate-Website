import type Stripe from "stripe";

import { db } from "@/db/client.server";
import { plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withDbRetry } from "@/lib/db-retry.server";
import { logAuditEvent } from "@/lib/audit.server";

import { grantCreditsForPayment } from "./credit-grants.server";
import { markPaymentSucceeded, recordSucceededInvoicePayment } from "./payments.server";
import { findCreditPack } from "./credit-packs";
import { getStripeClient } from "./stripe.server";
import { upsertLocalSubscriptionFromStripe } from "./subscriptions.server";

/**
 * PHASE 13: explicit event allowlist (spec §30 — "Do not process every
 * Stripe event blindly"). Anything not listed here is acknowledged
 * (200) and ignored without any business-logic side effect — Stripe
 * accounts emit dozens of event types this integration has no opinion
 * about (e.g. `charge.updated`, `payment_method.attached`), and silently
 * accepting-but-ignoring them is correct; only these matter here.
 */
const HANDLED_EVENT_TYPES = new Set<string>([
  "checkout.session.completed",
  "invoice.payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

export function isHandledEventType(type: string): boolean {
  return HANDLED_EVENT_TYPES.has(type);
}

/**
 * Runs the business logic for one already-signature-verified, already
 * idempotency-claimed Stripe event. Throwing from here is what makes the
 * caller (the webhook route) mark the event FAILED and return a non-2xx
 * so Stripe retries (spec §61) — every handler below is written so that
 * a retry after a partial failure is always safe (spec §9: this whole
 * file assumes it may run twice for the same event).
 */
export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session, event);
      return;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice, event);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await handleSubscriptionSync(event.data.object as Stripe.Subscription, event);
      return;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, event);
      return;
    default:
      // Not in HANDLED_EVENT_TYPES — the caller shouldn't reach here, but
      // staying defensive costs nothing.
      return;
  }
}

/**
 * Spec §22/§18: the ONLY event that finalizes a one-time credit-pack
 * purchase. For subscription-mode sessions, this instead just links the
 * newly-created Stripe Subscription into the local `subscriptions` table
 * — it deliberately never grants credits for subscriptions (that's
 * `invoice.payment_succeeded`'s job, so the very first payment and every
 * renewal go through the exact same, single code path).
 */
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
  event: Stripe.Event,
): Promise<void> {
  const userId =
    session.client_reference_id ?? (session.metadata?.["pixoraUserId"] as string | undefined);
  if (!userId) {
    throw new Error(
      `Checkout Session ${session.id} has no client_reference_id/pixoraUserId metadata.`,
    );
  }

  if (session.mode === "payment") {
    // Spec §22: "Do not assume Checkout completion always means funds
    // are permanently paid" — check Stripe's own payment_status.
    if (session.payment_status !== "paid") return;

    const packSlug = session.metadata?.["packSlug"];
    const pack = packSlug ? findCreditPack(packSlug) : undefined;
    if (!pack) {
      throw new Error(`Checkout Session ${session.id} has no recognizable packSlug in metadata.`);
    }

    const { paymentId, alreadySucceeded } = await withDbRetry(() =>
      markPaymentSucceeded(session.id, {
        amountCents: session.amount_total ?? 0,
        currency: (session.currency ?? "usd").toLowerCase(),
      }),
    );
    if (alreadySucceeded) return;

    await withDbRetry(() =>
      grantCreditsForPayment({
        userId,
        paymentId,
        amount: pack.credits,
        type: "PURCHASE",
        description: `Purchased ${pack.name} credit pack (${pack.credits.toLocaleString()} credits)`,
        metadata: { packSlug: pack.slug, stripeEventId: event.id },
      }),
    );
    return;
  }

  if (session.mode === "subscription" && typeof session.subscription === "string") {
    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    await withDbRetry(() =>
      upsertLocalSubscriptionFromStripe(userId, subscription, new Date(event.created * 1000)),
    );
    await logAuditEvent({
      actorUserId: userId,
      action: "SUBSCRIPTION_STARTED",
      entityType: "subscription",
      entityId: subscription.id,
      metadata: { planSlug: session.metadata?.["planSlug"] },
    });
  }
}

/**
 * Invoice -> Subscription ID, across Stripe API versions. Older versions
 * put it at `invoice.subscription`; from API version 2025-03-31 ("basil")
 * onward that field is gone and it lives at
 * `invoice.parent.subscription_details.subscription`. Webhook payloads are
 * serialized in the API version of the endpoint/CLI listener, NOT the
 * version this SDK client is pinned to, so both shapes must be handled -
 * reading only the old field silently skipped every subscription credit
 * grant on newer API versions.
 */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = invoice.subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;

  const parent = (
    invoice as unknown as {
      parent?: {
        subscription_details?: { subscription?: string | { id: string } | null } | null;
      } | null;
    }
  ).parent;
  const modern = parent?.subscription_details?.subscription;
  if (typeof modern === "string") return modern;
  if (modern && typeof modern === "object") return modern.id;
  return null;
}

/**
 * Spec §33/§34/§35: the SOLE trigger for granting subscription credits —
 * fires identically for a brand-new subscription's first invoice and
 * every later renewal invoice, so "grant once initially" and "grant once
 * per renewal" collapse into one idempotent code path keyed on the
 * Stripe Invoice ID.
 */
async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
  event: Stripe.Event,
): Promise<void> {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return; // Not a subscription invoice — nothing for this integration to do.

  // Fetch the Subscription object itself for the user ID rather than
  // trusting any metadata shape on the Invoice object directly — the
  // Subscription is what `subscription_data.metadata` at Checkout-creation
  // time actually populated (see checkout.server.ts), so it's the
  // reliable source for `pixoraUserId` regardless of exactly which
  // Invoice fields this Stripe API version does or doesn't expose.
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const userId = subscription.metadata?.["pixoraUserId"];
  if (!userId) {
    throw new Error(
      `Subscription ${subscriptionId} (invoice ${invoice.id}) has no pixoraUserId metadata.`,
    );
  }

  const result = await withDbRetry(() =>
    upsertLocalSubscriptionFromStripe(userId, subscription, new Date(event.created * 1000)),
  );
  if (!result) {
    // Unrecognized Price — refuse to grant credits for a plan we can't
    // verify (spec §47).
    return;
  }

  const [plan] = await db
    .select({ monthlyCredits: plans.monthlyCredits })
    .from(plans)
    .where(eq(plans.slug, result.planSlug));
  if (!plan || plan.monthlyCredits <= 0) return;

  const { paymentId, wasAlreadyRecorded } = await withDbRetry(() =>
    recordSucceededInvoicePayment({
      userId,
      subscriptionId: result.subscriptionId,
      invoiceId: invoice.id,
      amountCents: invoice.amount_paid,
      currency: invoice.currency,
      metadata: {
        planSlug: result.planSlug,
        label: `${result.planSlug} plan renewal`,
        stripeEventId: event.id,
      },
    }),
  );
  if (wasAlreadyRecorded) return;

  await withDbRetry(() =>
    grantCreditsForPayment({
      userId,
      paymentId,
      amount: plan.monthlyCredits,
      type: "SUBSCRIPTION",
      description: `${result.planSlug} plan credits`,
      metadata: { planSlug: result.planSlug, invoiceId: invoice.id },
    }),
  );
}

/** Keeps local status/period/cancel-at-period-end in sync (spec §30-32).
 * Never grants or revokes credits by itself (spec §33/§40). */
async function handleSubscriptionSync(
  eventSubscription: Stripe.Subscription,
  event: Stripe.Event,
): Promise<void> {
  // Re-fetch instead of trusting the event payload's shape: it is
  // serialized in the endpoint's API version (period dates, for example,
  // moved from the subscription to its items in newer versions), while
  // this client is pinned, so a fresh retrieve always has the shape the
  // rest of this module expects - and reflects Stripe's CURRENT state,
  // which also makes out-of-order delivery harmless.
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(eventSubscription.id);

  const userId = subscription.metadata?.["pixoraUserId"] as string | undefined;
  if (!userId) {
    console.error(
      `Stripe subscription ${subscription.id} has no pixoraUserId metadata - skipping sync.`,
    );
    return;
  }
  await withDbRetry(() =>
    upsertLocalSubscriptionFromStripe(userId, subscription, new Date(event.created * 1000)),
  );
}

/** Spec §40: no new credits, and the status sync above (triggered by the
 * `customer.subscription.updated` Stripe also sends around a failed
 * renewal) already reflects PAST_DUE — this handler exists mainly as a
 * safe, explicit log point rather than letting the event fall through to
 * "unhandled". */
async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  event: Stripe.Event,
): Promise<void> {
  console.warn(
    `Invoice ${invoice.id} payment failed for subscription ${String(getInvoiceSubscriptionId(invoice))} (event ${event.id}) — no credits granted.`,
  );
}
