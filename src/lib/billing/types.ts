/**
 * PHASE 13: shared billing types. Credit-pack/plan catalog shapes live
 * here so both the server (checkout creation) and the client (rendering
 * the Credits/Pricing pages) can import the same shape — this file holds
 * no secrets and makes no Stripe calls itself.
 */

export type BillingInterval = "MONTHLY" | "YEARLY";

/** Mirrors `subscriptionStatusEnum` in db/schema/enums.ts. */
export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";

/** Mirrors `paymentStatusEnum`. */
export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";

/** Mirrors `paymentTypeEnum`. */
export type PaymentType = "CREDIT_PURCHASE" | "SUBSCRIPTION" | "ONE_TIME";

export type CreditPack = {
  slug: string;
  name: string;
  credits: number;
  priceCents: number;
  /** Shown as a small badge on the Credits page (e.g. "Most popular") —
   * purely presentational, not authoritative for anything. */
  note?: string;
};

export type PlanSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  monthlyCredits: number;
  features: string[];
  /** Whether THIS server has a real Stripe Price ID configured for at
   * least one interval of this plan — the Pricing page uses this to show
   * "Contact us" (Enterprise, or any plan with no Price configured) vs a
   * real Checkout button, without hardcoding which plan slugs are
   * self-serve in the UI itself. */
  selfServeAvailable: boolean;
};

export type BillingSummary = {
  balance: number;
  stripeConfigured: boolean;
  subscription: {
    planName: string;
    planSlug: string;
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  /** True once the user has a Stripe Customer (i.e. has purchased or
   * subscribed at least once) — gates whether "Manage Billing" (the
   * Stripe Billing Portal) is offered at all. */
  hasBillingPortal: boolean;
};

export type PaymentHistoryItem = {
  id: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  type: PaymentType;
  description: string;
  createdAt: string;
};
