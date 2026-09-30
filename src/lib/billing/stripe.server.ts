import Stripe from "stripe";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client.server";
import { users } from "@/db/schema";
import { env } from "@/lib/env.server";

import { BillingError } from "./errors.server";

/**
 * Pinned API version (spec §5: "Do not hardcode an old API version
 * without reason" — reasoning here is the opposite: pin a CURRENT one
 * deliberately, so Stripe's dashboard/webhook payload shapes can't
 * silently drift out from under this code on their own schedule).
 */
const STRIPE_API_VERSION = "2024-06-20";

let cachedClient: Stripe | undefined;

/** True when a Stripe secret key is present. Every checkout/portal path
 * checks this FIRST and fails to a clear "not configured" state (spec
 * §2) rather than attempting a Stripe call with an empty key. */
export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/**
 * Lazily-constructed singleton — constructing `Stripe` with an empty key
 * would either throw or silently produce a client that fails every call;
 * callers MUST check `isStripeConfigured()` (or catch the
 * `BillingError` this throws) before using it either way.
 */
export function getStripeClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new BillingError(
      "STRIPE_NOT_CONFIGURED",
      "Payments aren't available right now. Please try again later.",
    );
  }
  if (cachedClient === undefined) {
    cachedClient = new Stripe(env.STRIPE_SECRET_KEY, {
      // Deliberately pinned (webhook payload shapes depend on it). The installed
      // SDK types only list its own latest version, hence the cast.
      apiVersion: STRIPE_API_VERSION as unknown as Stripe.LatestApiVersion,
      // Real intent, not a display label — every Checkout Session and
      // customer-creation call in this module also passes its own
      // idempotency key (spec §44); this is Stripe's client-level retry
      // behavior for transient network failures on top of that.
      maxNetworkRetries: 2,
    });
  }
  return cachedClient;
}

/**
 * Returns the user's existing Stripe Customer ID, or creates one.
 * Concurrency-safe against the common case (two near-simultaneous
 * checkout clicks from the same browser) via a conditional UPDATE:
 * whichever request's UPDATE actually flips `stripeCustomerId` from
 * NULL wins and is the one considered authoritative; a loser whose
 * UPDATE affected zero rows (because a concurrent request already set
 * it) simply re-reads the now-set value instead of creating a second
 * Stripe Customer for the same user (spec §12). This is a best-effort
 * guard, not a hard lock — a sufficiently pathological race (two
 * requests both reading `null` from two different connections in the
 * same instant) could still create two Customers; that's an acceptable,
 * cheap-to-clean-up edge case for this phase, not a financial-integrity
 * bug (nothing else keys off "exactly one Customer").
 */
export async function hasStripeCustomer(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId));
  return Boolean(row?.stripeCustomerId);
}

export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  const [existing] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId));

  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create(
    { email, metadata: { pixoraUserId: userId } },
    // Stripe-level idempotency: a network retry of THIS exact create
    // call can't create a second Customer even before our own DB check
    // above would catch it.
    { idempotencyKey: `pixora-customer-${userId}` },
  );

  const [updated] = await db
    .update(users)
    .set({ stripeCustomerId: customer.id })
    .where(and(eq(users.id, userId), isNull(users.stripeCustomerId)))
    .returning({ stripeCustomerId: users.stripeCustomerId });

  if (updated?.stripeCustomerId === customer.id) return customer.id;

  // Someone else's request won the race and already stored a (possibly
  // different) customer ID between our SELECT and this UPDATE — use
  // theirs, and leave the extra Stripe Customer we just created
  // orphaned rather than risk any users<->customer inconsistency.
  const [reread] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId));

  return reread?.stripeCustomerId ?? customer.id;
}
