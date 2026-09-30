import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client.server";
import { creditBalances, creditTransactions } from "@/db/schema";

import { GenerationError } from "./ai/errors.server";

/**
 * `db` itself, or the `tx` object handed to a `db.transaction(async (tx) =>
 * ...)` callback — both expose the same `.update()`/`.insert()`/etc. query
 * builder methods. Derived from `db.transaction`'s own callback parameter
 * type rather than importing Drizzle's internal transaction type directly,
 * so this doesn't depend on knowing (or keeping in sync with) that type's
 * exact generic signature.
 */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Atomically reserves (deducts) `amount` credits and writes the ledger
 * entry. The UPDATE's WHERE clause (`balance >= amount`) makes the
 * deduction itself race-safe at the database level — two concurrent
 * requests can't both succeed against the same balance and drive it
 * negative, without needing an explicit `SELECT ... FOR UPDATE` lock. If
 * the row doesn't match (insufficient funds), the UPDATE affects zero
 * rows, `returning()` comes back empty, and this throws.
 *
 * IMPORTANT: pass the SAME `tx` the caller is already inside if this is
 * being called from within a `db.transaction(...)` block (see
 * generation.server.ts) — using the outer `db` instead would try to
 * reference a row (e.g. a just-inserted `generations` id) that isn't
 * committed yet, and isn't visible outside that transaction. That
 * mismatch is exactly what caused the
 * `credit_transactions_generation_id_generations_id_fk` violation this
 * function used to produce.
 */
export async function reserveCredits(
  executor: Executor,
  userId: string,
  amount: number,
  generationId: string,
  description: string,
): Promise<void> {
  const [updated] = await executor
    .update(creditBalances)
    .set({ balance: sql`${creditBalances.balance} - ${amount}`, updatedAt: new Date() })
    .where(and(eq(creditBalances.userId, userId), sql`${creditBalances.balance} >= ${amount}`))
    .returning({ balance: creditBalances.balance });

  if (!updated) {
    throw new GenerationError(
      "INSUFFICIENT_CREDITS",
      "You don't have enough credits for this generation.",
    );
  }

  await executor.insert(creditTransactions).values({
    userId,
    amount: -amount,
    type: "GENERATION",
    description,
    generationId,
  });
}

/**
 * Refunds `amount` credits for `generationId` — but only if a REFUND row
 * for that generation doesn't already exist. This is what makes refunds
 * idempotent: retried failure-handling code (or, in principle, two
 * concurrent failure paths for the same generation) can call this as many
 * times as it wants and the user is only ever credited back once.
 */
export async function refundCreditsIfNotAlready(
  userId: string,
  amount: number,
  generationId: string,
  description: string,
): Promise<void> {
  const [existingRefund] = await db
    .select({ id: creditTransactions.id })
    .from(creditTransactions)
    .where(
      and(eq(creditTransactions.generationId, generationId), eq(creditTransactions.type, "REFUND")),
    );

  if (existingRefund) return;

  await db.transaction(async (tx) => {
    // PHASE 14: insert the ledger row FIRST and only touch the balance if
    // that insert actually happened. With the partial unique index
    // `credit_transactions_generation_refund_unique_idx` (one REFUND row
    // per generation, added in the Phase 14 migration), two concurrent
    // refund attempts cannot both succeed: the loser's insert is a no-op
    // and its balance update is skipped, so credits are refunded exactly
    // once even if the check-then-insert above races. Before that
    // migration is applied the insert never conflicts and behavior is
    // identical to the previous version.
    const inserted = await tx
      .insert(creditTransactions)
      .values({
        userId,
        amount,
        type: "REFUND",
        description,
        generationId,
      })
      .onConflictDoNothing()
      .returning({ id: creditTransactions.id });

    if (inserted.length === 0) return;

    await tx
      .update(creditBalances)
      .set({ balance: sql`${creditBalances.balance} + ${amount}`, updatedAt: new Date() })
      .where(eq(creditBalances.userId, userId));
  });
}

export async function getCreditBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({ balance: creditBalances.balance })
    .from(creditBalances)
    .where(eq(creditBalances.userId, userId));

  return row?.balance ?? 0;
}
