import { eq, sql } from "drizzle-orm";

import { db } from "@/db/client.server";
import { creditBalances, creditTransactions } from "@/db/schema";

/**
 * Grants `amount` credits tied to `paymentId`, exactly once — this is
 * THE non-negotiable idempotency primitive for Phase 13 (spec §23):
 * "Do not grant twice." A pre-check SELECT below handles the common
 * case cheaply; the REAL guarantee is the unique index on
 * `credit_transactions.paymentId` (see db/schema/credits.ts) — a
 * genuinely concurrent duplicate call fails its INSERT with Postgres
 * error 23505 (unique_violation), which is caught below and treated as
 * "already granted", not an error. Combined with payments.server.ts's
 * own idempotency (a payment row only reaches SUCCEEDED once, and
 * invoice-based rows are `onConflictDoNothing` on the Stripe invoice
 * ID), a webhook replay calling this again with the same `paymentId` is
 * always a safe no-op.
 */
export async function grantCreditsForPayment(input: {
  userId: string;
  paymentId: string;
  amount: number;
  type: "PURCHASE" | "SUBSCRIPTION";
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<{ granted: boolean }> {
  const [existing] = await db
    .select({ id: creditTransactions.id })
    .from(creditTransactions)
    .where(eq(creditTransactions.paymentId, input.paymentId));

  if (existing) return { granted: false };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(creditBalances)
        .set({ balance: sql`${creditBalances.balance} + ${input.amount}`, updatedAt: new Date() })
        .where(eq(creditBalances.userId, input.userId));

      // No pre-insert re-check needed here — the unique index on
      // `paymentId` (see db/schema/credits.ts) makes a duplicate INSERT
      // fail outright rather than silently succeeding, which the catch
      // block below treats as "already granted", not an error.
      await tx.insert(creditTransactions).values({
        userId: input.userId,
        amount: input.amount,
        type: input.type,
        description: input.description,
        paymentId: input.paymentId,
        metadata: input.metadata,
      });
    });
  } catch (error) {
    // Postgres unique_violation is SQLSTATE 23505 — a genuinely
    // concurrent caller won the race and already granted this exact
    // payment's credits. Anything else is a real error and must
    // propagate (so the webhook is marked FAILED and Stripe retries).
    const code =
      (error as { cause?: { code?: string }; code?: string })?.code ??
      (error as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") return { granted: false };
    throw error;
  }

  return { granted: true };
}
