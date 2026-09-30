import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Central place for every Postgres enum used across the schema.
 * Keeping them here (instead of inline per-table) avoids duplicate enum
 * names and makes it obvious what the full set of statuses/types is.
 */

export const userRoleEnum = pgEnum("user_role", ["USER", "ADMIN", "SUPER_ADMIN"]);

export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "SUSPENDED", "BANNED"]);

export const verificationTokenPurposeEnum = pgEnum("verification_token_purpose", [
  "EMAIL_VERIFICATION",
  "PASSWORD_RESET",
]);

export const aiModelTypeEnum = pgEnum("ai_model_type", [
  "TEXT_TO_IMAGE",
  "IMAGE_TO_IMAGE",
  "UPSCALE",
  "BACKGROUND_REMOVAL",
  "OUTPAINT",
  "EDITOR",
]);

export const aiModelStatusEnum = pgEnum("ai_model_status", [
  "ACTIVE",
  "INACTIVE",
  "BETA",
  "DEPRECATED",
]);

export const generationTypeEnum = pgEnum("generation_type", [
  "TEXT_TO_IMAGE",
  "IMAGE_TO_IMAGE",
  "BACKGROUND_REMOVAL",
  "UPSCALE",
  "OUTPAINT",
  "EDITOR",
]);

export const generationStatusEnum = pgEnum("generation_status", [
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const creditTransactionTypeEnum = pgEnum("credit_transaction_type", [
  "PURCHASE",
  "GENERATION",
  "REFUND",
  "BONUS",
  "SUBSCRIPTION",
  "ADMIN_ADJUSTMENT",
]);

export const billingIntervalEnum = pgEnum("billing_interval", ["MONTHLY", "YEARLY"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "REFUNDED",
]);

export const paymentTypeEnum = pgEnum("payment_type", [
  "CREDIT_PURCHASE",
  "SUBSCRIPTION",
  "ONE_TIME",
]);

// IMPORTANT: only ever APPEND new values to this list — never reorder or
// remove existing ones. Drizzle compares positionally, so a reordering
// makes it emit `DROP TYPE ... ; CREATE TYPE ...`, which Postgres refuses
// once any column depends on the type. Appending produces a safe
// `ALTER TYPE ... ADD VALUE` instead.
export const assetPurposeEnum = pgEnum("asset_purpose", [
  // --- Original Phase 2 values (keep in this exact order) ---
  "GENERATION_OUTPUT",
  "GENERATION_INPUT",
  "AVATAR",
  "PROJECT_COVER",
  "OTHER",
  // --- Phase 5 additions (appended) ---
  "AI_INPUT",
  "IMAGE_TO_IMAGE_INPUT",
  "BACKGROUND_REMOVAL_INPUT",
  "UPSCALE_INPUT",
  "OUTPAINT_INPUT",
  "EDITOR_INPUT",
  "GENERATED_OUTPUT",
]);

export const reportTargetTypeEnum = pgEnum("report_target_type", [
  "CREATION",
  "USER",
  "GENERATION",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "PENDING",
  "REVIEWING",
  "RESOLVED",
  "DISMISSED",
]);

// PHASE 13 (billing): tracks processed Stripe webhook events for
// idempotency. "PROCESSING" is a short-lived claim state (see
// billing/webhook-events.server.ts) — a row only stays there for the
// duration of one request; "FAILED" allows a legitimate Stripe retry of
// the SAME event ID to reprocess, while "PROCESSED" permanently blocks
// re-processing (Stripe redelivering an already-successful event).
export const stripeWebhookEventStatusEnum = pgEnum("stripe_webhook_event_status", [
  "PROCESSING",
  "PROCESSED",
  "FAILED",
]);
