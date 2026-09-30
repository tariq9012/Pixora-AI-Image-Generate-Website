export type BillingErrorCode =
  | "STRIPE_NOT_CONFIGURED"
  | "INVALID_PACK"
  | "INVALID_PLAN"
  | "PLAN_NOT_SELF_SERVE"
  | "RATE_LIMITED"
  | "NO_STRIPE_CUSTOMER"
  | "STRIPE_ERROR"
  | "CHECKOUT_FAILED";

/**
 * The only kind of error billing code throws on purpose — mirrors
 * ai/errors.server.ts's GenerationError exactly, same reasoning: server
 * functions catch this and forward `code`/`message` to the client, and
 * anything else (a raw Stripe SDK exception, a DB error) is logged in
 * full server-side and reported to the client as a generic
 * "Something went wrong" — Stripe error internals never reach the
 * browser.
 */
export class BillingError extends Error {
  code: BillingErrorCode;

  constructor(code: BillingErrorCode, message: string) {
    super(message);
    this.name = "BillingError";
    this.code = code;
  }
}
