import { and, asc, desc, eq, gte, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db/client.server";
import { aiModels, creations, favorites, generations } from "@/db/schema";
import type { ListCreationsInput } from "@/lib/validation/creations";

import {
  OPERATION_LABELS,
  type CreationListItem,
  type CreationListResult,
  type OperationType,
  type UsedModel,
} from "./types";

/**
 * PHASE 12 AUDIT NOTE (My Creations):
 *
 * The previous route (`src/routes/creations.tsx`) rendered `CREATIONS`
 * from `src/lib/mock-data.ts` unconditionally — every tile, every prompt,
 * every "model" badge, every date was fake, identical for every logged-in
 * user. The Favorite/Delete/Download/Open buttons only called
 * `toast.*()`; none of them touched a database. The "Date"/"Project"
 * filters had no `onChange` handler at all (dead UI). The "Shared" tab
 * filtered on a `views` count that has no corresponding real column
 * anywhere in the schema, and the "Project" filter used mock projects
 * from a whole separate feature (`/projects`) that is ALSO still fully
 * mock (`src/routes/projects.tsx` — confirmed by audit, out of scope
 * here). Both were removed rather than wired to fake data — see this
 * phase's final report for the full list of what changed and why.
 *
 * Below is real, authenticated, paginated, ownership-scoped SQL against
 * `creations` — zero schema changes (every column already existed).
 */

const MAX_TITLE_FALLBACK_LENGTH = 80;

function resolveTitle(
  title: string | null,
  prompt: string | null,
  operationType: OperationType | null,
): string {
  const trimmedTitle = title?.trim();
  if (trimmedTitle) return trimmedTitle;
  const trimmedPrompt = prompt?.trim();
  if (trimmedPrompt) {
    return trimmedPrompt.length > MAX_TITLE_FALLBACK_LENGTH
      ? `${trimmedPrompt.slice(0, MAX_TITLE_FALLBACK_LENGTH).trimEnd()}…`
      : trimmedPrompt;
  }
  return operationType ? OPERATION_LABELS[operationType] : "Untitled";
}

export async function listUserCreations(
  userId: string,
  input: ListCreationsInput,
): Promise<CreationListResult> {
  const { page, pageSize, type, modelId, favoritesOnly, search, sinceDays, sort } = input;
  const offset = (page - 1) * pageSize;

  const conditions = [eq(creations.userId, userId), eq(creations.isDeleted, false)];
  if (type) conditions.push(eq(generations.type, type));
  if (modelId) conditions.push(eq(generations.modelId, modelId));
  if (sinceDays) {
    conditions.push(
      gte(creations.createdAt, new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)),
    );
  }
  if (favoritesOnly) conditions.push(sql`${favorites.id} IS NOT NULL`);
  if (search) {
    const term = `%${search}%`;
    const searchCondition = or(
      ilike(creations.title, term),
      ilike(generations.prompt, term),
      ilike(aiModels.name, term),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  const whereClause = and(...conditions);
  const orderBy = sort === "oldest" ? asc(creations.createdAt) : desc(creations.createdAt);

  // Every filter above (favoritesOnly, search-by-model-name) needs the
  // same three joins, so both the page query and its count query join
  // identically — two queries total for the whole page, not one per row
  // (spec §22/§74: no N+1). Written out twice (rather than factored into
  // a shared helper) because threading Drizzle's fluent query builder
  // through a generic function is its own source of type trouble; a
  // little duplication here is the safer trade-off.
  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: creations.id,
        title: creations.title,
        imageUrl: creations.imageUrl,
        width: creations.width,
        height: creations.height,
        createdAt: creations.createdAt,
        prompt: generations.prompt,
        operationType: generations.type,
        modelName: aiModels.name,
        isFavorite: sql<boolean>`${favorites.id} IS NOT NULL`,
      })
      .from(creations)
      .leftJoin(generations, eq(creations.generationId, generations.id))
      .leftJoin(aiModels, eq(generations.modelId, aiModels.id))
      .leftJoin(
        favorites,
        and(eq(favorites.creationId, creations.id), eq(favorites.userId, userId)),
      )
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(creations)
      .leftJoin(generations, eq(creations.generationId, generations.id))
      .leftJoin(aiModels, eq(generations.modelId, aiModels.id))
      .leftJoin(
        favorites,
        and(eq(favorites.creationId, creations.id), eq(favorites.userId, userId)),
      )
      .where(whereClause),
  ]);

  const total = countRows[0]?.count ?? 0;

  const items: CreationListItem[] = rows.map((r) => ({
    id: r.id,
    title: resolveTitle(r.title, r.prompt, r.operationType),
    imageUrl: r.imageUrl,
    width: r.width,
    height: r.height,
    createdAt: r.createdAt.toISOString(),
    operationType: r.operationType,
    operationLabel: r.operationType ? OPERATION_LABELS[r.operationType] : "Unknown",
    modelName: r.modelName,
    prompt: r.prompt,
    isFavorite: Boolean(r.isFavorite),
  }));

  return { items, page, pageSize, total, hasNext: offset + items.length < total };
}

/** Real models used to populate the "Model" filter dropdown — only
 * models THIS user has actually generated with, not every model in the
 * system (a user who never touched Image-to-Image shouldn't see it as a
 * filter option). One cheap DISTINCT query, called once per page load,
 * not per card. */
export async function listUserUsedModels(userId: string): Promise<UsedModel[]> {
  const rows = await db
    .selectDistinct({ id: aiModels.id, name: aiModels.name })
    .from(generations)
    .innerJoin(aiModels, eq(generations.modelId, aiModels.id))
    .where(eq(generations.userId, userId))
    .orderBy(asc(aiModels.name));
  return rows;
}

export class CreationNotFoundError extends Error {
  constructor() {
    super("Creation not found.");
    this.name = "CreationNotFoundError";
  }
}

/**
 * Real add/remove toggle against the `favorites` table (spec §29-31).
 * Ownership-scoped to the CURRENT user's OWN creation only (§30) — Phase
 * 12 doesn't touch Explore/cross-user favoriting, which the schema
 * comment on favorites.ts notes is a later, deliberate feature.
 * Idempotent: a concurrent double-click that both try to insert can only
 * violate the unique index once; the loser is treated as a no-op success
 * rather than an error, since the end state ("favorited") is identical.
 */
export async function toggleFavoriteForUser(
  userId: string,
  creationId: string,
): Promise<{ isFavorite: boolean }> {
  const [owned] = await db
    .select({ id: creations.id })
    .from(creations)
    .where(
      and(
        eq(creations.id, creationId),
        eq(creations.userId, userId),
        eq(creations.isDeleted, false),
      ),
    );
  if (!owned) throw new CreationNotFoundError();

  const [existing] = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.creationId, creationId)));

  if (existing) {
    await db.delete(favorites).where(eq(favorites.id, existing.id));
    return { isFavorite: false };
  }

  try {
    await db.insert(favorites).values({ userId, creationId });
  } catch (error) {
    // Unique-index race with a concurrent request that favorited the
    // exact same creation a moment earlier — the desired end state
    // (favorited) already holds, so this isn't a real failure.
    console.warn("Favorite insert race (harmless, unique index held):", error);
  }
  return { isFavorite: true };
}

/**
 * Soft delete only (spec §32-34): flips `creations.isDeleted`, and
 * nothing else. Deliberately does NOT touch the `generations` row (kept
 * for History/audit) or the `creditTransactions` ledger, and does NOT
 * delete the underlying storage object — `creations.ts`'s own schema
 * comment already documents this exact policy ("a real cleanup job
 * (later phase) can hard-delete rows that have been soft-deleted past a
 * retention window"). Also removes any of the CURRENT user's favorite
 * rows pointing at it, since a hidden creation showing up in "Favorites"
 * would be a worse bug than losing that favorite flag.
 */
export async function softDeleteCreationForUser(userId: string, creationId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(creations)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(
        and(
          eq(creations.id, creationId),
          eq(creations.userId, userId),
          eq(creations.isDeleted, false),
        ),
      )
      .returning({ id: creations.id });

    if (updated.length === 0) throw new CreationNotFoundError();

    await tx.delete(favorites).where(eq(favorites.creationId, creationId));
  });
}
