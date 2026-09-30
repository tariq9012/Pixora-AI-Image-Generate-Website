import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client.server";
import { aiModels, creations, creditTransactions, generations } from "@/db/schema";
import type { ListHistoryInput } from "@/lib/validation/creations";

import { OPERATION_LABELS, type HistoryListItem, type HistoryListResult } from "./types";

/**
 * PHASE 12 AUDIT NOTE (History):
 *
 * The previous route (`src/routes/history.tsx`) rendered `HISTORY` from
 * `src/lib/mock-data.ts` — fake statuses, fake thumbnails, fake credit
 * costs, identical for every user. "Regenerate", "Edit", "Download", and
 * "Delete" all only called `toast.*()`. "Regenerate" was deliberately NOT
 * rebuilt for real here — actually resubmitting a job means re-invoking
 * the Phase 6-11 generation pipelines (with a fresh charge, and, for
 * image-based tools, needing the original source asset to still exist),
 * which is generation-pipeline work, not retrieval/display (spec §51).
 * "Delete" on a HISTORY row was removed entirely rather than wired,
 * because History must stay auditable (spec §34) — deleting a
 * generation would blow a hole in a user's own credit-ledger trail. (My
 * Creations still gets a real, safe, ledger-preserving Delete — see
 * queries.server.ts's softDeleteCreationForUser.)
 *
 * Below is real, authenticated, paginated, ownership-scoped SQL against
 * `generations`, joined with `ai_models` for the display name and
 * `credit_transactions` for the REAL net cost (accounting for refunds,
 * spec §35-36) — zero schema changes.
 */

export async function listUserGenerationHistory(
  userId: string,
  input: ListHistoryInput,
): Promise<HistoryListResult> {
  const { page, pageSize, type, status, modelId, sort } = input;
  const offset = (page - 1) * pageSize;

  const conditions = [eq(generations.userId, userId)];
  if (type) conditions.push(eq(generations.type, type));
  if (status) conditions.push(eq(generations.status, status));
  if (modelId) conditions.push(eq(generations.modelId, modelId));
  const whereClause = and(...conditions);
  const orderBy = sort === "oldest" ? asc(generations.createdAt) : desc(generations.createdAt);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: generations.id,
        status: generations.status,
        type: generations.type,
        prompt: generations.prompt,
        createdAt: generations.createdAt,
        completedAt: generations.completedAt,
        creditsUsed: generations.creditsUsed,
        errorMessage: generations.errorMessage,
        outputImageUrl: generations.outputImageUrl,
        modelName: aiModels.name,
      })
      .from(generations)
      .leftJoin(aiModels, eq(generations.modelId, aiModels.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(generations)
      .where(whereClause),
  ]);

  const total = countRows[0]?.count ?? 0;
  const ids = rows.map((r) => r.id);

  // Real net cost per generation, accounting for refunds (spec §35-36):
  // one grouped query for the WHOLE page's worth of generation IDs, not
  // one query per row. amount is negative for the original charge,
  // positive for a refund — summed, a fully-refunded job nets to ~0.
  const netByGeneration = new Map<string, number>();
  if (ids.length > 0) {
    const sums = await db
      .select({
        generationId: creditTransactions.generationId,
        net: sql<number>`sum(${creditTransactions.amount})::int`,
      })
      .from(creditTransactions)
      .where(inArray(creditTransactions.generationId, ids))
      .groupBy(creditTransactions.generationId);
    for (const s of sums) {
      if (s.generationId) netByGeneration.set(s.generationId, s.net);
    }
  }

  // The real persisted output/creation for each generation, if one
  // exists and hasn't been soft-deleted from My Creations — again one
  // IN() query for the whole page, not per row.
  const creationByGeneration = new Map<string, { id: string; imageUrl: string }>();
  if (ids.length > 0) {
    const relatedCreations = await db
      .select({
        id: creations.id,
        generationId: creations.generationId,
        imageUrl: creations.imageUrl,
      })
      .from(creations)
      .where(and(inArray(creations.generationId, ids), eq(creations.isDeleted, false)));
    for (const c of relatedCreations) {
      if (c.generationId)
        creationByGeneration.set(c.generationId, { id: c.id, imageUrl: c.imageUrl });
    }
  }

  const items: HistoryListItem[] = rows.map((r) => {
    const net = netByGeneration.get(r.id);
    // Fall back to the generation's own stored `creditsUsed` only if no
    // ledger rows exist at all for it (e.g. a legacy/inconsistent row) —
    // the ledger is authoritative whenever it's present.
    const creditsUsedDisplay = net === undefined ? r.creditsUsed : Math.max(0, -net);
    const wasRefunded = r.creditsUsed > 0 && net !== undefined && creditsUsedDisplay === 0;
    const relatedCreation = creationByGeneration.get(r.id) ?? null;

    return {
      id: r.id,
      status: r.status,
      operationType: r.type,
      operationLabel: OPERATION_LABELS[r.type],
      modelName: r.modelName,
      prompt: r.prompt,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      creditsUsed: creditsUsedDisplay,
      wasRefunded,
      errorMessage: r.status === "FAILED" ? (r.errorMessage ?? "Generation failed.") : null,
      outputImageUrl: relatedCreation?.imageUrl ?? r.outputImageUrl ?? null,
      creationId: relatedCreation?.id ?? null,
    };
  });

  return { items, page, pageSize, total, hasNext: offset + items.length < total };
}
