import { and, eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { aiModels } from "@/db/schema";
import { isLocalOnnxEnabled } from "@/lib/ai/local/model-cache.server";

export type PublicAiModel = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  creditCost: number;
};

/**
 * Only ACTIVE models with `supportsTextToImage` are real, provider-backed
 * choices — everything else in `ai_models` (inactive/unconfigured rows)
 * stays invisible to the generation UI, per Phase 6's "start with one
 * verified model" requirement. The server independently re-validates this
 * on every generation request (see generation.server.ts) — this list is
 * for display only and is never trusted as authorization.
 */
export async function listActiveTextToImageModels(): Promise<PublicAiModel[]> {
  const rows = await db
    .select({
      id: aiModels.id,
      slug: aiModels.slug,
      name: aiModels.name,
      description: aiModels.description,
      creditCost: aiModels.creditCost,
    })
    .from(aiModels)
    .where(and(eq(aiModels.status, "ACTIVE"), eq(aiModels.supportsTextToImage, true)));

  return rows;
}

/**
 * Mirrors listActiveTextToImageModels above, filtered to
 * `supportsImageToImage` instead — same "display only, never trusted as
 * authorization" caveat applies (see generateImageToImage in
 * generation.server.ts for the real, independent server-side check).
 */
export async function listActiveImageToImageModels(): Promise<PublicAiModel[]> {
  const rows = await db
    .select({
      id: aiModels.id,
      slug: aiModels.slug,
      name: aiModels.name,
      description: aiModels.description,
      creditCost: aiModels.creditCost,
    })
    .from(aiModels)
    .where(and(eq(aiModels.status, "ACTIVE"), eq(aiModels.supportsImageToImage, true)));

  return rows;
}

/**
 * Mirrors the two above, filtered to `supportsBackgroundRemoval` —
 * same "display only" caveat (see generateBackgroundRemoval in
 * generation.server.ts for the real server-side check).
 */
export async function listActiveBackgroundRemovalModels(): Promise<PublicAiModel[]> {
  // Honest capability state: local ONNX inference is only offered when the
  // runtime is actually configured for it (see isLocalOnnxEnabled).
  if (!isLocalOnnxEnabled()) return [];

  const rows = await db
    .select({
      id: aiModels.id,
      slug: aiModels.slug,
      name: aiModels.name,
      description: aiModels.description,
      creditCost: aiModels.creditCost,
    })
    .from(aiModels)
    .where(and(eq(aiModels.status, "ACTIVE"), eq(aiModels.supportsBackgroundRemoval, true)));

  return rows;
}

/**
 * Mirrors the others above, filtered to `supportsUpscale` — same
 * "display only" caveat (see generateUpscale in generation.server.ts for
 * the real server-side check).
 */
export async function listActiveUpscaleModels(): Promise<PublicAiModel[]> {
  if (!isLocalOnnxEnabled()) return [];

  const rows = await db
    .select({
      id: aiModels.id,
      slug: aiModels.slug,
      name: aiModels.name,
      description: aiModels.description,
      creditCost: aiModels.creditCost,
    })
    .from(aiModels)
    .where(and(eq(aiModels.status, "ACTIVE"), eq(aiModels.supportsUpscale, true)));

  return rows;
}

/**
 * Mirrors the others above, filtered to `supportsOutpainting` — same
 * "display only" caveat (see generateOutpaint in generation.server.ts
 * for the real server-side check).
 */
export async function listActiveOutpaintModels(): Promise<PublicAiModel[]> {
  const rows = await db
    .select({
      id: aiModels.id,
      slug: aiModels.slug,
      name: aiModels.name,
      description: aiModels.description,
      creditCost: aiModels.creditCost,
    })
    .from(aiModels)
    .where(and(eq(aiModels.status, "ACTIVE"), eq(aiModels.supportsOutpainting, true)));

  return rows;
}

/**
 * Phase 11 (Editor / masked inpainting): filtered by `type = "EDITOR"`
 * rather than a new `supportsEditor` boolean — `aiModelTypeEnum` and
 * `generationTypeEnum` already had an "EDITOR" value reserved (see
 * db/schema/enums.ts), so this needed zero schema migration. Same
 * "display only, never trusted as authorization" caveat as the others —
 * generateEditorEdit in generation.server.ts independently re-checks
 * `model.type === "EDITOR"` server-side on every request.
 */
export async function listActiveEditorModels(): Promise<PublicAiModel[]> {
  const rows = await db
    .select({
      id: aiModels.id,
      slug: aiModels.slug,
      name: aiModels.name,
      description: aiModels.description,
      creditCost: aiModels.creditCost,
    })
    .from(aiModels)
    .where(and(eq(aiModels.status, "ACTIVE"), eq(aiModels.type, "EDITOR")));

  return rows;
}
