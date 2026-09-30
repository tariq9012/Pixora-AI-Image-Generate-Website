import { eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { users } from "@/db/schema";
import { checkRateLimit } from "@/lib/auth/rate-limit.server";
import { env } from "@/lib/env.server";

import { findCreditPack } from "./credit-packs";
import { BillingError } from "./errors.server";
import { createPendingPayment } from "./payments.server";
import { getConfiguredPriceId, isPlanSelfServe } from "./plan-pricing.server";
import { getOrCreateStripeCustomer, getStripeClient, isStripeConfigured } from "./stripe.server";
import type { BillingInterval } from "./types";

/**
 * PHASE 13 AUDIT NOTE (checkout):
 *
 * The previous Credits page's "Buy Credits" / "Buy {pack}" buttons and
 * Pricing page's plan CTAs did not call any server code at all — no
 * Checkout Session, no payment record, nothing. This module is the only
 * place a Stripe Checkout Session is ever created, and it is the only
 * place that decides the real amount/credits/Price ID for a request —
 * the client only ever sends a pack/plan SLUG (spec §13/§46).
 */

function baseUrl(): string {
  return env.APP_URL.replace(/\/$/, "");
}

function ensureConfigured(): void {
  if (!isStripeConfigured()) {
    throw new BillingError(
      "STRIPE_NOT_CONFIGURED",
      "Payments aren't available right now. Please try again later.",
    );
  }
}

function rateLimitOrThrow(userId: string): void {
  const result = checkRateLimit(`billing-checkout:${userId}`, { max: 8, windowMs: 60 * 1000 });
  if (!result.allowed) {
    throw new BillingError("RATE_LIMITED", "Please wait a moment before trying again.");
  }
}

async function getUserEmail(userId: string): Promise<string> {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  if (!row) throw new Error(`User ${userId} not found while creating Checkout session.`);
  return row.email;
}

/**
 * One-time credit-pack purchase. `mode: "payment"` per spec §13. Uses
 * inline `price_data` (see credit-packs.ts's doc comment for why that's
 * the deliberate choice here) rather than a pre-created Stripe Price —
 * the amount/currency/credits all come from `findCreditPack`, resolved
 * server-side from the slug the client sent, never from the client
 * directly.
 */
export async function createCreditPackCheckoutSession(
  userId: string,
  packSlug: string,
): Promise<{ url: string }> {
  ensureConfigured();
  rateLimitOrThrow(userId);

  const pack = findCreditPack(packSlug);
  if (!pack) throw new BillingError("INVALID_PACK", "That credit pack isn't available.");

  const email = await getUserEmail(userId);
  const customerId = await getOrCreateStripeCustomer(userId, email);
  const stripe = getStripeClient();
  const currency = env.STRIPE_CREDIT_PACK_CURRENCY;

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer: customerId,
      client_reference_id: userId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: pack.priceCents,
            product_data: {
              name: `${pack.name} — ${pack.credits.toLocaleString()} Pixora credits`,
            },
          },
        },
      ],
      metadata: { pixoraUserId: userId, packSlug: pack.slug, credits: String(pack.credits) },
      success_url: `${baseUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl()}/billing/cancel`,
    },
    // A fresh random key per call (not a network-retry key reused across
    // separate user actions) — Stripe's own maxNetworkRetries reuses THIS
    // exact value for retries of this one request; a genuine double-click
    // is a new call with a new key, which is fine (spec §73: at most it
    // creates a second open Checkout Session, never a double credit grant
    // — see credit-grants.server.ts for why that stays safe either way).
    { idempotencyKey: `pixora-pack-checkout-${crypto.randomUUID()}` },
  );

  if (!session.url) {
    throw new BillingError("CHECKOUT_FAILED", "Could not start checkout. Please try again.");
  }

  await createPendingPayment({
    userId,
    checkoutSessionId: session.id,
    amountCents: pack.priceCents,
    currency,
    type: "CREDIT_PURCHASE",
    metadata: { packSlug: pack.slug, credits: pack.credits, label: `${pack.name} credit pack` },
  });

  return { url: session.url };
}

/**
 * Subscription Checkout — `mode: "subscription"` per spec §26, using a
 * real, server-configured Stripe Price ID (never a client-chosen one).
 * Deliberately does NOT create a local `payments` row here (unlike the
 * credit-pack path above): the actual charge amount/timing for a
 * subscription is only fully known once Stripe issues an Invoice, and
 * `invoice.payment_succeeded` already creates its own SUCCEEDED payment
 * row for the FIRST invoice exactly the same way it does for every
 * renewal (see webhooks.server.ts) — a second, checkout-time PENDING row
 * here would just be an orphaned bookkeeping artifact with no clean way
 * to reconcile back to that invoice. This function's webhook counterpart
 * (`checkout.session.completed`) only creates/links the local
 * `subscriptions` row; it never grants credits itself (spec §33).
 */
export async function createSubscriptionCheckoutSession(
  userId: string,
  planSlug: string,
  interval: BillingInterval,
): Promise<{ url: string }> {
  ensureConfigured();
  rateLimitOrThrow(userId);

  if (!isPlanSelfServe(planSlug)) {
    throw new BillingError(
      "PLAN_NOT_SELF_SERVE",
      "That plan isn't available for self-serve checkout.",
    );
  }
  const priceId = getConfiguredPriceId(planSlug, interval);
  if (!priceId) {
    throw new BillingError(
      "PLAN_NOT_SELF_SERVE",
      "That plan isn't available for self-serve checkout.",
    );
  }

  const email = await getUserEmail(userId);
  const customerId = await getOrCreateStripeCustomer(userId, email);
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { pixoraUserId: userId, planSlug, interval },
      subscription_data: {
        metadata: { pixoraUserId: userId, planSlug },
      },
      success_url: `${baseUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl()}/billing/cancel`,
    },
    { idempotencyKey: `pixora-sub-checkout-${crypto.randomUUID()}` },
  );

  if (!session.url) {
    throw new BillingError("CHECKOUT_FAILED", "Could not start checkout. Please try again.");
  }

  return { url: session.url };
}

/**
 * Stripe Billing Portal (spec §37/§38) — self-service payment method
 * management, invoices, and cancellation, so this integration doesn't
 * need to rebuild any of that UI itself.
 */
export async function createBillingPortalSession(userId: string): Promise<{ url: string }> {
  ensureConfigured();
  rateLimitOrThrow(userId);

  const [row] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId));
  if (!row?.stripeCustomerId) {
    throw new BillingError("NO_STRIPE_CUSTOMER", "You don't have any billing history yet.");
  }

  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${baseUrl()}/credits`,
  });

  return { url: session.url };
}
