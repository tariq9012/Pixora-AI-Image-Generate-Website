import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth/guards.server";
import { getCreditBalance } from "@/lib/credits.server";
import {
  creditPackCheckoutSchema,
  listPaymentsSchema,
  subscriptionCheckoutSchema,
} from "@/lib/validation/billing";

import {
  createBillingPortalSession,
  createCreditPackCheckoutSession,
  createSubscriptionCheckoutSession,
} from "./checkout.server";
import { BillingError } from "./errors.server";
import { listUserPayments } from "./payments.server";
import { listActivePlans } from "./plans.server";
import { hasStripeCustomer, isStripeConfigured } from "./stripe.server";
import { getUserSubscription } from "./subscriptions.server";
import type { BillingSummary } from "./types";
import { logAuditEvent } from "@/lib/audit.server";

/**
 * Every function below derives the user from the authenticated session
 * via `requireUser()` — never from client input (spec §5/§48). None of
 * these ever mark a payment PAID or grant credits directly; they only
 * ever create a Checkout/Portal Session (a URL to redirect to) or read
 * the user's OWN billing data. Only the webhook route
 * (routes/api.stripe.webhook.ts) can finalize money.
 */

export type CheckoutResult =
  { success: true; url: string } | { success: false; code: string; message: string };

function toCheckoutResult(error: unknown): CheckoutResult {
  if (error instanceof BillingError) {
    return { success: false, code: error.code, message: error.message };
  }
  console.error("Billing checkout failed:", error);
  return {
    success: false,
    code: "CHECKOUT_FAILED",
    message: "Something went wrong. Please try again.",
  };
}

export const createCreditPackCheckoutFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => creditPackCheckoutSchema.parse(input))
  .handler(async ({ data }): Promise<CheckoutResult> => {
    const user = await requireUser();
    try {
      const { url } = await createCreditPackCheckoutSession(user.id, data.packSlug);
      await logAuditEvent({
        actorUserId: user.id,
        action: "CHECKOUT_CREATED",
        entityType: "credit_pack",
        entityId: data.packSlug,
      });
      return { success: true, url };
    } catch (error) {
      return toCheckoutResult(error);
    }
  });

export const createSubscriptionCheckoutFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => subscriptionCheckoutSchema.parse(input))
  .handler(async ({ data }): Promise<CheckoutResult> => {
    const user = await requireUser();
    try {
      const { url } = await createSubscriptionCheckoutSession(
        user.id,
        data.planSlug,
        data.interval,
      );
      await logAuditEvent({
        actorUserId: user.id,
        action: "CHECKOUT_CREATED",
        entityType: "plan",
        entityId: data.planSlug,
        metadata: { interval: data.interval },
      });
      return { success: true, url };
    } catch (error) {
      return toCheckoutResult(error);
    }
  });

export const createBillingPortalFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<CheckoutResult> => {
    const user = await requireUser();
    try {
      const { url } = await createBillingPortalSession(user.id);
      await logAuditEvent({
        actorUserId: user.id,
        action: "BILLING_PORTAL_OPENED",
        entityType: "user",
        entityId: user.id,
      });
      return { success: true, url };
    } catch (error) {
      return toCheckoutResult(error);
    }
  },
);

export const getBillingSummaryFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<BillingSummary> => {
    const user = await requireUser();
    const [balance, subscription, portalAvailable] = await Promise.all([
      getCreditBalance(user.id),
      getUserSubscription(user.id),
      hasStripeCustomer(user.id),
    ]);

    return {
      balance,
      stripeConfigured: isStripeConfigured(),
      subscription: subscription
        ? {
            planName: subscription.planName,
            planSlug: subscription.planSlug,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd
              ? subscription.currentPeriodEnd.toISOString()
              : null,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
      hasBillingPortal: portalAvailable,
    };
  },
);

export const listPaymentsFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => listPaymentsSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    return listUserPayments(user.id, data);
  });

export const listActivePlansFn = createServerFn({ method: "GET" }).handler(async () => {
  return listActivePlans();
});
