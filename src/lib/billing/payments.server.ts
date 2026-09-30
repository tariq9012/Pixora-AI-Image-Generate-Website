import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client.server";
import { payments } from "@/db/schema";

import type { PaymentHistoryItem, PaymentType } from "./types";

const STRIPE_PROVIDER = "stripe";

/**
 * Creates the local PENDING payment row at Checkout-Session-creation
 * time (spec §17) — this is bookkeeping only, never what marks money as
 * received (see webhooks.server.ts's doc comment / spec §18: only a
 * verified webhook may flip this to SUCCEEDED). `providerPaymentId` is
 * the Checkout Session ID; it doubles as the reconciliation key the
 * webhook uses to find this exact row back (spec §22).
 */
export async function createPendingPayment(input: {
  userId: string;
  checkoutSessionId: string;
  amountCents: number;
  currency: string;
  type: PaymentType;
  subscriptionId?: string;
  metadata: Record<string, unknown>;
}): Promise<string> {
  const [row] = await db
    .insert(payments)
    .values({
      userId: input.userId,
      subscriptionId: input.subscriptionId ?? null,
      provider: STRIPE_PROVIDER,
      providerPaymentId: input.checkoutSessionId,
      amountCents: input.amountCents,
      currency: input.currency,
      status: "PENDING",
      type: input.type,
      metadata: input.metadata,
    })
    .returning({ id: payments.id });

  if (!row) throw new Error("Failed to create pending payment record.");
  return row.id;
}

/**
 * A renewal invoice has no prior "pending" row (Checkout only happens
 * once, at subscription start) — this creates one already-succeeded,
 * keyed by the Stripe Invoice ID so the same invoice can never produce
 * two payment rows (spec §21/§34/§35's idempotency requirement),
 * `onConflictDoNothing` makes a webhook replay of the same invoice a
 * true no-op at the DB level, not just an application-level check.
 */
export async function recordSucceededInvoicePayment(input: {
  userId: string;
  subscriptionId: string;
  invoiceId: string;
  amountCents: number;
  currency: string;
  metadata: Record<string, unknown>;
}): Promise<{ paymentId: string; wasAlreadyRecorded: boolean }> {
  const inserted = await db
    .insert(payments)
    .values({
      userId: input.userId,
      subscriptionId: input.subscriptionId,
      provider: STRIPE_PROVIDER,
      providerPaymentId: input.invoiceId,
      amountCents: input.amountCents,
      currency: input.currency,
      status: "SUCCEEDED",
      type: "SUBSCRIPTION",
      metadata: input.metadata,
    })
    .onConflictDoNothing({ target: payments.providerPaymentId })
    .returning({ id: payments.id });

  if (inserted[0]) return { paymentId: inserted[0].id, wasAlreadyRecorded: false };

  const [existing] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.providerPaymentId, input.invoiceId));

  if (!existing)
    throw new Error("Invoice payment insert conflicted but no existing row was found.");
  return { paymentId: existing.id, wasAlreadyRecorded: true };
}

/** Reconciles a pending Checkout-created payment against Stripe's own
 * confirmed amount/currency (spec §46) before marking it SUCCEEDED. A
 * mismatch throws rather than silently trusting the stored amount — the
 * caller (webhooks.server.ts) treats that as a failed webhook (logged,
 * non-2xx, credits NOT granted) rather than crediting a possibly-tampered
 * or corrupted record. */
export async function markPaymentSucceeded(
  checkoutSessionId: string,
  confirmed: { amountCents: number; currency: string },
): Promise<{ paymentId: string; userId: string; alreadySucceeded: boolean }> {
  const [existing] = await db
    .select()
    .from(payments)
    .where(eq(payments.providerPaymentId, checkoutSessionId));

  if (!existing) {
    throw new Error(`No local payment row found for Checkout Session ${checkoutSessionId}.`);
  }

  if (existing.amountCents !== confirmed.amountCents || existing.currency !== confirmed.currency) {
    throw new Error(
      `Amount/currency mismatch for Checkout Session ${checkoutSessionId}: expected ` +
        `${existing.amountCents} ${existing.currency}, Stripe confirmed ${confirmed.amountCents} ${confirmed.currency}.`,
    );
  }

  if (existing.status === "SUCCEEDED") {
    return { paymentId: existing.id, userId: existing.userId, alreadySucceeded: true };
  }

  await db
    .update(payments)
    .set({ status: "SUCCEEDED", updatedAt: new Date() })
    .where(and(eq(payments.id, existing.id), eq(payments.status, "PENDING")));

  return { paymentId: existing.id, userId: existing.userId, alreadySucceeded: false };
}

export async function listUserPayments(
  userId: string,
  { page, pageSize }: { page: number; pageSize: number },
): Promise<{ items: PaymentHistoryItem[]; total: number; hasNext: boolean }> {
  const offset = (page - 1) * pageSize;

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(payments)
      .where(eq(payments.userId, userId)),
  ]);

  const total = countRows[0]?.count ?? 0;

  const items: PaymentHistoryItem[] = rows.map((r) => ({
    id: r.id,
    amountCents: r.amountCents,
    currency: r.currency,
    status: r.status,
    type: r.type,
    description: describePayment(r.type, r.metadata),
    createdAt: r.createdAt.toISOString(),
  }));

  return { items, total, hasNext: offset + items.length < total };
}

function describePayment(type: PaymentType, metadata: Record<string, unknown> | null): string {
  const label =
    metadata && typeof metadata["label"] === "string" ? (metadata["label"] as string) : null;
  if (label) return label;
  if (type === "CREDIT_PURCHASE") return "Credit purchase";
  if (type === "SUBSCRIPTION") return "Subscription";
  return "Payment";
}
