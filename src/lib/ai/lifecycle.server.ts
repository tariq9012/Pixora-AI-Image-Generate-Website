import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client.server";
import { creations, generations } from "@/db/schema";

import { refundCreditsIfNotAlready } from "../credits.server";
import { withDbRetry } from "../db-retry.server";
import { GenerationError } from "./errors.server";

/**
 * PHASE 14B: guarded generation state transitions.
 *
 * Every transition is a single conditional UPDATE whose WHERE clause names
 * the state it expects to leave, so the database (not application memory)
 * decides who wins when a request and the stale-generation cleanup job
 * (cleanup.server.ts) touch the same row at the same time:
 *
 *   QUEUED     -> PROCESSING   markGenerationProcessing
 *   PROCESSING -> COMPLETED    markGenerationCompleted
 *   QUEUED|PROCESSING -> FAILED  failGenerationAndRefund
 *
 * A terminal row (COMPLETED / FAILED) is never moved again by a request.
 */

export const GENERATION_TIMEOUT_CODE = "GENERATION_TIMEOUT" as const;
export const GENERATION_TIMEOUT_MESSAGE = "Generation timed out before completion.";

async function readStatus(generationId: string) {
  const [row] = await withDbRetry(() =>
    db
      .select({ status: generations.status })
      .from(generations)
      .where(eq(generations.id, generationId)),
  );
  return row?.status;
}

/**
 * QUEUED -> PROCESSING. If the row is no longer QUEUED (the cleanup job
 * already failed + refunded it), the request must NOT go on to call the
 * provider — it throws GENERATION_TIMEOUT, which the caller's catch block
 * handles like any other failure (its refund is a no-op: already refunded).
 */
export async function markGenerationProcessing(generationId: string): Promise<void> {
  const now = new Date();
  const moved = await withDbRetry(() =>
    db
      .update(generations)
      .set({ status: "PROCESSING", startedAt: now, updatedAt: now })
      .where(and(eq(generations.id, generationId), eq(generations.status, "QUEUED")))
      .returning({ id: generations.id }),
  );
  if (moved.length > 0) return;

  // Zero rows can also mean a withDbRetry retry after the first attempt
  // actually committed. Already PROCESSING is therefore fine.
  if ((await readStatus(generationId)) === "PROCESSING") return;

  throw new GenerationError(GENERATION_TIMEOUT_CODE, GENERATION_TIMEOUT_MESSAGE);
}

/**
 * PROCESSING -> COMPLETED. Only succeeds if the row is still PROCESSING.
 *
 * If the cleanup job won the race (row is FAILED and already refunded or
 * about to be), this request must not report success: the creation rows it
 * just inserted for this generation are SOFT-deleted (isDeleted = true —
 * reversible, no storage object is touched) and GENERATION_TIMEOUT is
 * thrown. Only rows whose generation_id is this generation are affected,
 * and that id is unique to this request.
 */
export async function markGenerationCompleted(
  generationId: string,
  values: { outputImageUrl: string | null; providerJobId: string | null },
): Promise<void> {
  const now = new Date();
  const completed = await withDbRetry(() =>
    db
      .update(generations)
      .set({
        status: "COMPLETED",
        completedAt: now,
        outputImageUrl: values.outputImageUrl,
        providerJobId: values.providerJobId,
        updatedAt: now,
      })
      .where(and(eq(generations.id, generationId), eq(generations.status, "PROCESSING")))
      .returning({ id: generations.id }),
  );
  if (completed.length > 0) return;

  // Same retry-after-commit reasoning as markGenerationProcessing.
  if ((await readStatus(generationId)) === "COMPLETED") return;

  await withDbRetry(() =>
    db
      .update(creations)
      .set({ isDeleted: true, updatedAt: now })
      .where(eq(creations.generationId, generationId)),
  );

  throw new GenerationError(GENERATION_TIMEOUT_CODE, GENERATION_TIMEOUT_MESSAGE);
}

/**
 * Normal failure path: QUEUED|PROCESSING -> FAILED, then refund.
 *
 *  - The FAILED update is conditional, so a COMPLETED row can never be
 *    overwritten, and a row the cleanup job already failed keeps the
 *    timeout code it was given.
 *  - The refund is skipped only if the row ended up COMPLETED. For a row
 *    that is FAILED (by this call or by cleanup) the refund runs;
 *    refundCreditsIfNotAlready is idempotent (unique partial index), so
 *    "cleanup and this handler both refund" still credits exactly once.
 */
export async function failGenerationAndRefund(params: {
  userId: string;
  generationId: string;
  cost: number;
  code: string;
  message: string;
}): Promise<void> {
  const now = new Date();
  await withDbRetry(() =>
    db
      .update(generations)
      .set({
        status: "FAILED",
        completedAt: now,
        errorCode: params.code,
        errorMessage: params.message,
        updatedAt: now,
      })
      .where(
        and(
          eq(generations.id, params.generationId),
          inArray(generations.status, ["QUEUED", "PROCESSING"]),
        ),
      ),
  );

  if ((await readStatus(params.generationId)) === "COMPLETED") return;

  await withDbRetry(() =>
    refundCreditsIfNotAlready(
      params.userId,
      params.cost,
      params.generationId,
      `Refund for failed generation (${params.code})`,
    ),
  );
}
