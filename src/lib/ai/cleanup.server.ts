import { and, asc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db/client.server";
import { creditTransactions, generations } from "@/db/schema";
import { env } from "@/lib/env.server";

import { refundCreditsIfNotAlready } from "../credits.server";
import { withDbRetry } from "../db-retry.server";
import {
  GENERATION_TIMEOUT_CODE,
  GENERATION_TIMEOUT_MESSAGE,
} from "./lifecycle.server";

/**
 * PHASE 14B: closes out generations stranded by a killed function / crash /
 * hung provider, and refunds their credits exactly once.
 *
 * STALE POLICY (one global threshold, GENERATION_STALE_MINUTES, default 15):
 *   - PROCESSING and started_at <= now - threshold
 *       (started_at is written in the same UPDATE that sets PROCESSING;
 *        created_at is only a defensive fallback if it is ever null)
 *   - QUEUED and created_at <= now - threshold
 *       (QUEUED -> PROCESSING is one UPDATE right after the credit
 *        transaction commits, so a QUEUED row this old is certainly dead)
 *
 * CLAIM: one conditional UPDATE ... WHERE id = ? AND <stale predicate>
 * RETURNING. Zero rows returned means a request or another cleanup run
 * changed the row first, and this run does nothing for it.
 *
 * REFUND: after a successful claim, the existing refundCreditsIfNotAlready
 * is called with the amount of the ORIGINAL ledger deduction (never the
 * model's current price). Its partial unique index makes a second refund
 * impossible even if two cleanup runs race.
 *
 * REFUND FAILURE RECOVERY: claim and refund are separate DB operations (the
 * existing refund service owns its own transaction). If the refund fails
 * after the row is FAILED, reconcileTimedOutGenerationRefunds() finds it on
 * the next run (FAILED + GENERATION_TIMEOUT + a GENERATION ledger row + no
 * REFUND ledger row) and retries. The refund is never permanently lost.
 */

export const CLEANUP_BATCH_SIZE = 50;
const DEFAULT_STALE_MINUTES = 15;

export function getGenerationStaleMinutes(): number {
  return env.GENERATION_STALE_MINUTES ?? DEFAULT_STALE_MINUTES;
}

export type CleanupSummary = {
  /** stale candidates found this run (bounded by CLEANUP_BATCH_SIZE) */
  scanned: number;
  /** rows this run moved to FAILED */
  claimed: number;
  /** candidates another request/run changed first (nothing done) */
  skipped: number;
  /** claimed rows with no credit deduction (nothing to refund) */
  noCreditsToRefund: number;
  /** REFUND ledger rows written by this run */
  refunded: number;
  /** refund attempts that threw (retried by reconciliation) */
  refundFailed: number;
  durationMs: number;
};

export type ReconcileSummary = {
  scanned: number;
  refunded: number;
  alreadyRefunded: number;
  refundFailed: number;
};

function stalePredicate(cutoff: Date) {
  return or(
    and(
      eq(generations.status, "PROCESSING"),
      or(
        and(isNotNull(generations.startedAt), lte(generations.startedAt, cutoff)),
        and(isNull(generations.startedAt), lte(generations.createdAt, cutoff)),
      ),
    ),
    and(eq(generations.status, "QUEUED"), lte(generations.createdAt, cutoff)),
  );
}

/** Original deduction for a generation, from the ledger. Returns a positive
 * number of credits, or 0 if none was ever taken. */
async function getOriginalDeduction(generationId: string, userId: string): Promise<number> {
  const [row] = await withDbRetry(() =>
    db
      .select({ total: sql<string | null>`sum(${creditTransactions.amount})` })
      .from(creditTransactions)
      .where(
        and(
          eq(creditTransactions.generationId, generationId),
          eq(creditTransactions.userId, userId),
          eq(creditTransactions.type, "GENERATION"),
        ),
      ),
  );
  const total = Number(row?.total ?? 0);
  return Number.isFinite(total) && total < 0 ? -total : 0;
}

export async function cleanupStaleGenerations(): Promise<CleanupSummary> {
  const startedAt = Date.now();
  const cutoff = new Date(startedAt - getGenerationStaleMinutes() * 60 * 1000);

  const summary: CleanupSummary = {
    scanned: 0,
    claimed: 0,
    skipped: 0,
    noCreditsToRefund: 0,
    refunded: 0,
    refundFailed: 0,
    durationMs: 0,
  };

  console.info(
    `[generation-cleanup] run started (stale after ${getGenerationStaleMinutes()} min, batch ${CLEANUP_BATCH_SIZE})`,
  );

  const candidates = await withDbRetry(() =>
    db
      .select({ id: generations.id, userId: generations.userId })
      .from(generations)
      .where(stalePredicate(cutoff))
      .orderBy(asc(generations.createdAt))
      .limit(CLEANUP_BATCH_SIZE),
  );
  summary.scanned = candidates.length;

  for (const candidate of candidates) {
    // Atomic claim. The stale predicate is re-evaluated by the database in
    // the same statement that flips the row, so a request that completed or
    // failed the row in the meantime makes this match zero rows.
    const now = new Date();
    const [claimed] = await withDbRetry(() =>
      db
        .update(generations)
        .set({
          status: "FAILED",
          completedAt: now,
          errorCode: GENERATION_TIMEOUT_CODE,
          errorMessage: GENERATION_TIMEOUT_MESSAGE,
          updatedAt: now,
        })
        .where(and(eq(generations.id, candidate.id), stalePredicate(cutoff)))
        .returning({ id: generations.id, userId: generations.userId }),
    );

    if (!claimed) {
      summary.skipped += 1;
      continue;
    }
    summary.claimed += 1;

    try {
      const amount = await getOriginalDeduction(claimed.id, claimed.userId);
      if (amount <= 0) {
        summary.noCreditsToRefund += 1;
        continue;
      }

      const refunded = await refundCreditsIfNotAlready(
        claimed.userId,
        amount,
        claimed.id,
        `Refund for timed-out generation (${GENERATION_TIMEOUT_CODE})`,
      );
      if (refunded) summary.refunded += 1;
    } catch (error) {
      // The row is already FAILED; reconcileTimedOutGenerationRefunds()
      // retries this refund on the next run.
      summary.refundFailed += 1;
      console.error(
        `[generation-cleanup] refund failed for generation ${claimed.id}; reconciliation will retry:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  summary.durationMs = Date.now() - startedAt;
  console.info(
    `[generation-cleanup] run finished scanned=${summary.scanned} claimed=${summary.claimed} skipped=${summary.skipped} refunded=${summary.refunded} refundFailed=${summary.refundFailed} noCredits=${summary.noCreditsToRefund} durationMs=${summary.durationMs}`,
  );

  return summary;
}

/**
 * Retries refunds for timeout-failed generations that have a credit
 * deduction but no REFUND ledger row. Scoped strictly to
 * error_code = GENERATION_TIMEOUT: it never refunds ordinary provider
 * failures, which refund in their own catch block.
 */
export async function reconcileTimedOutGenerationRefunds(): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = {
    scanned: 0,
    refunded: 0,
    alreadyRefunded: 0,
    refundFailed: 0,
  };

  const rows = await withDbRetry(() =>
    db
      .select({ id: generations.id, userId: generations.userId })
      .from(generations)
      .where(
        and(
          eq(generations.status, "FAILED"),
          eq(generations.errorCode, GENERATION_TIMEOUT_CODE),
          inArray(
            generations.id,
            db
              .select({ id: creditTransactions.generationId })
              .from(creditTransactions)
              .where(eq(creditTransactions.type, "GENERATION")),
          ),
          sql`not exists (
            select 1 from ${creditTransactions}
            where ${creditTransactions.generationId} = ${generations.id}
              and ${creditTransactions.type} = 'REFUND'
          )`,
        ),
      )
      .orderBy(asc(generations.createdAt))
      .limit(CLEANUP_BATCH_SIZE),
  );
  summary.scanned = rows.length;

  for (const row of rows) {
    try {
      const amount = await getOriginalDeduction(row.id, row.userId);
      if (amount <= 0) continue;

      const refunded = await refundCreditsIfNotAlready(
        row.userId,
        amount,
        row.id,
        `Refund for timed-out generation (${GENERATION_TIMEOUT_CODE})`,
      );
      if (refunded) summary.refunded += 1;
      else summary.alreadyRefunded += 1;
    } catch (error) {
      summary.refundFailed += 1;
      console.error(
        `[generation-cleanup] reconciliation refund failed for generation ${row.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (summary.scanned > 0) {
    console.info(
      `[generation-cleanup] reconciliation scanned=${summary.scanned} refunded=${summary.refunded} alreadyRefunded=${summary.alreadyRefunded} refundFailed=${summary.refundFailed}`,
    );
  }

  return summary;
}
