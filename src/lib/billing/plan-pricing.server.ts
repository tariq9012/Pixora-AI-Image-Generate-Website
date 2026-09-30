import { env } from "@/lib/env.server";

import type { BillingInterval } from "./types";

/**
 * Real Stripe Price IDs, configured server-side via env vars (spec
 * §14/§15/§27) — never trusted from the client. A plan/interval with no
 * entry here (or an unset env var) is simply not available for
 * self-serve Checkout; "creator"/"pro" are the only plans wired for
 * self-serve today, matching the seeded plans (`free`, `creator`, `pro`,
 * `enterprise` — see db/seed.ts) where "free" needs no Stripe object at
 * all (spec §28) and "enterprise" stays contact-sales (spec §27).
 */
const PLAN_PRICE_ENV_MAP: Record<string, Record<BillingInterval, string | undefined>> = {
  creator: {
    MONTHLY: env.STRIPE_PRICE_CREATOR_MONTHLY,
    YEARLY: env.STRIPE_PRICE_CREATOR_YEARLY,
  },
  pro: {
    MONTHLY: env.STRIPE_PRICE_PRO_MONTHLY,
    YEARLY: env.STRIPE_PRICE_PRO_YEARLY,
  },
};

/** The reverse lookup, built once — used by the subscription webhook
 * handler to figure out WHICH local plan a Stripe subscription's actual
 * Price ID corresponds to (spec §47: verify the real purchased Price,
 * never trust a "plan" string from metadata alone). */
const PRICE_TO_PLAN_SLUG = new Map<string, string>();
for (const [planSlug, intervals] of Object.entries(PLAN_PRICE_ENV_MAP)) {
  for (const priceId of Object.values(intervals)) {
    if (priceId) PRICE_TO_PLAN_SLUG.set(priceId, planSlug);
  }
}

export function getConfiguredPriceId(planSlug: string, interval: BillingInterval): string | null {
  return PLAN_PRICE_ENV_MAP[planSlug]?.[interval] ?? null;
}

export function isPlanSelfServe(planSlug: string): boolean {
  const intervals = PLAN_PRICE_ENV_MAP[planSlug];
  if (!intervals) return false;
  return Boolean(intervals.MONTHLY || intervals.YEARLY);
}

/** Given a Stripe Price ID actually present on a subscription/invoice
 * line item, returns which local plan slug it maps to, or null if it
 * doesn't match ANY configured plan — the caller (webhooks.server.ts)
 * must treat that as "don't activate a plan we can't verify" rather than
 * guessing from metadata. */
export function resolvePlanSlugForPriceId(priceId: string): string | null {
  return PRICE_TO_PLAN_SLUG.get(priceId) ?? null;
}
