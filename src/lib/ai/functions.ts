import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth/guards.server";
import {
  generateBackgroundRemovalSchema,
  generateEditorSchema,
  generateImageToImageSchema,
  generateOutpaintSchema,
  generateTextToImageSchema,
  generateUpscaleSchema,
} from "@/lib/validation/generation";

import { getCreditBalance } from "../credits.server";
import { GenerationError } from "./errors.server";
import {
  generateBackgroundRemoval,
  generateEditorEdit,
  generateImageToImage,
  generateOutpaint,
  generateTextToImage,
  generateUpscale,
  type GenerateBackgroundRemovalOutput,
  type GenerateEditorOutput,
  type GenerateImageToImageOutput,
  type GenerateOutpaintOutput,
  type GenerateTextToImageOutput,
  type GenerateUpscaleOutput,
} from "./generation.server";
import {
  listActiveBackgroundRemovalModels,
  listActiveEditorModels,
  listActiveImageToImageModels,
  listActiveOutpaintModels,
  listActiveTextToImageModels,
  listActiveUpscaleModels,
} from "./models.server";

export type GenerateTextToImageResult =
  | ({ success: true } & GenerateTextToImageOutput)
  | { success: false; code: string; message: string };

/**
 * In-memory de-duplication for accidental duplicate submissions (double
 * click, a client-side retry after a dropped response, etc). Keyed by
 * `userId:idempotencyKey`; a repeat call with the same key while the
 * first one is still running — or shortly after it finished — gets the
 * SAME result instead of triggering a second charge/generation.
 *
 * Same caveat as src/lib/auth/rate-limit.server.ts: this is process-local
 * memory, fine for a single instance, and would need a shared store
 * (Redis/KV) to work correctly across multiple server instances.
 */
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const idempotencyCache = new Map<
  string,
  { promise: Promise<GenerateTextToImageOutput>; expiresAt: number }
>();

function pruneExpiredIdempotencyEntries() {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache) {
    if (entry.expiresAt < now) idempotencyCache.delete(key);
  }
}

export const generateTextToImageFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const parsed = generateTextToImageSchema.parse(input);
    const idempotencyKey =
      input && typeof input === "object" && "idempotencyKey" in input
        ? String((input as { idempotencyKey?: unknown }).idempotencyKey ?? "")
        : "";
    return { ...parsed, idempotencyKey };
  })
  .handler(async ({ data }): Promise<GenerateTextToImageResult> => {
    const user = await requireUser();
    const { idempotencyKey, ...generationInput } = data;

    pruneExpiredIdempotencyEntries();

    const cacheKey = idempotencyKey ? `${user.id}:${idempotencyKey}` : null;
    const existing = cacheKey ? idempotencyCache.get(cacheKey) : undefined;

    const run = () => generateTextToImage({ userId: user.id, ...generationInput });
    const resultPromise = existing?.promise ?? run();

    if (cacheKey && !existing) {
      idempotencyCache.set(cacheKey, {
        promise: resultPromise,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      });
    }

    try {
      const result = await resultPromise;
      return { success: true, ...result };
    } catch (error) {
      if (cacheKey) idempotencyCache.delete(cacheKey);

      if (error instanceof GenerationError) {
        return { success: false, code: error.code, message: error.message };
      }
      console.error("Text-to-image generation failed:", error);
      return {
        success: false,
        code: "GENERATION_FAILED",
        message: "Something went wrong. Please try again.",
      };
    }
  });

export const getActiveModelsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  return listActiveTextToImageModels();
});

export const getCreditBalanceFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return getCreditBalance(user.id);
});

// --- Phase 7: Image-to-Image ---

export type GenerateImageToImageResult =
  | ({ success: true } & GenerateImageToImageOutput)
  | { success: false; code: string; message: string };

/** Separate idempotency cache from text-to-image's above — different
 * input shape, and there's no reason a duplicate-submission guard for one
 * tool should share state (or a TTL bucket) with another. */
const imageToImageIdempotencyCache = new Map<
  string,
  { promise: Promise<GenerateImageToImageOutput>; expiresAt: number }
>();

function pruneExpiredImageToImageIdempotencyEntries() {
  const now = Date.now();
  for (const [key, entry] of imageToImageIdempotencyCache) {
    if (entry.expiresAt < now) imageToImageIdempotencyCache.delete(key);
  }
}

export const generateImageToImageFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const parsed = generateImageToImageSchema.parse(input);
    const idempotencyKey =
      input && typeof input === "object" && "idempotencyKey" in input
        ? String((input as { idempotencyKey?: unknown }).idempotencyKey ?? "")
        : "";
    return { ...parsed, idempotencyKey };
  })
  .handler(async ({ data }): Promise<GenerateImageToImageResult> => {
    const user = await requireUser();
    const { idempotencyKey, ...generationInput } = data;

    pruneExpiredImageToImageIdempotencyEntries();

    const cacheKey = idempotencyKey ? `${user.id}:${idempotencyKey}` : null;
    const existing = cacheKey ? imageToImageIdempotencyCache.get(cacheKey) : undefined;

    const run = () => generateImageToImage({ userId: user.id, ...generationInput });
    const resultPromise = existing?.promise ?? run();

    if (cacheKey && !existing) {
      imageToImageIdempotencyCache.set(cacheKey, {
        promise: resultPromise,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      });
    }

    try {
      const result = await resultPromise;
      return { success: true, ...result };
    } catch (error) {
      if (cacheKey) imageToImageIdempotencyCache.delete(cacheKey);

      if (error instanceof GenerationError) {
        return { success: false, code: error.code, message: error.message };
      }
      console.error("Image-to-image generation failed:", error);
      return {
        success: false,
        code: "GENERATION_FAILED",
        message: "Something went wrong. Please try again.",
      };
    }
  });

export const getActiveImageToImageModelsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  return listActiveImageToImageModels();
});

// --- Phase 8: Background Removal ---

export type GenerateBackgroundRemovalResult =
  | ({ success: true } & GenerateBackgroundRemovalOutput)
  | { success: false; code: string; message: string };

/** Separate idempotency cache — same reasoning as image-to-image's above. */
const backgroundRemovalIdempotencyCache = new Map<
  string,
  { promise: Promise<GenerateBackgroundRemovalOutput>; expiresAt: number }
>();

function pruneExpiredBackgroundRemovalIdempotencyEntries() {
  const now = Date.now();
  for (const [key, entry] of backgroundRemovalIdempotencyCache) {
    if (entry.expiresAt < now) backgroundRemovalIdempotencyCache.delete(key);
  }
}

export const generateBackgroundRemovalFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const parsed = generateBackgroundRemovalSchema.parse(input);
    const idempotencyKey =
      input && typeof input === "object" && "idempotencyKey" in input
        ? String((input as { idempotencyKey?: unknown }).idempotencyKey ?? "")
        : "";
    return { ...parsed, idempotencyKey };
  })
  .handler(async ({ data }): Promise<GenerateBackgroundRemovalResult> => {
    const user = await requireUser();
    const { idempotencyKey, ...generationInput } = data;

    pruneExpiredBackgroundRemovalIdempotencyEntries();

    const cacheKey = idempotencyKey ? `${user.id}:${idempotencyKey}` : null;
    const existing = cacheKey ? backgroundRemovalIdempotencyCache.get(cacheKey) : undefined;

    const run = () => generateBackgroundRemoval({ userId: user.id, ...generationInput });
    const resultPromise = existing?.promise ?? run();

    if (cacheKey && !existing) {
      backgroundRemovalIdempotencyCache.set(cacheKey, {
        promise: resultPromise,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      });
    }

    try {
      const result = await resultPromise;
      return { success: true, ...result };
    } catch (error) {
      if (cacheKey) backgroundRemovalIdempotencyCache.delete(cacheKey);

      if (error instanceof GenerationError) {
        return { success: false, code: error.code, message: error.message };
      }
      console.error("Background removal failed:", error);
      return {
        success: false,
        code: "GENERATION_FAILED",
        message: "Something went wrong. Please try again.",
      };
    }
  });

export const getActiveBackgroundRemovalModelsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireUser();
    return listActiveBackgroundRemovalModels();
  },
);

// --- Phase 9: Upscale ---

export type GenerateUpscaleResult =
  ({ success: true } & GenerateUpscaleOutput) | { success: false; code: string; message: string };

/** Separate idempotency cache — same reasoning as the other tools' above. */
const upscaleIdempotencyCache = new Map<
  string,
  { promise: Promise<GenerateUpscaleOutput>; expiresAt: number }
>();

function pruneExpiredUpscaleIdempotencyEntries() {
  const now = Date.now();
  for (const [key, entry] of upscaleIdempotencyCache) {
    if (entry.expiresAt < now) upscaleIdempotencyCache.delete(key);
  }
}

export const generateUpscaleFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const parsed = generateUpscaleSchema.parse(input);
    const idempotencyKey =
      input && typeof input === "object" && "idempotencyKey" in input
        ? String((input as { idempotencyKey?: unknown }).idempotencyKey ?? "")
        : "";
    return { ...parsed, idempotencyKey };
  })
  .handler(async ({ data }): Promise<GenerateUpscaleResult> => {
    const user = await requireUser();
    const { idempotencyKey, ...generationInput } = data;

    pruneExpiredUpscaleIdempotencyEntries();

    const cacheKey = idempotencyKey ? `${user.id}:${idempotencyKey}` : null;
    const existing = cacheKey ? upscaleIdempotencyCache.get(cacheKey) : undefined;

    const run = () => generateUpscale({ userId: user.id, ...generationInput });
    const resultPromise = existing?.promise ?? run();

    if (cacheKey && !existing) {
      upscaleIdempotencyCache.set(cacheKey, {
        promise: resultPromise,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      });
    }

    try {
      const result = await resultPromise;
      return { success: true, ...result };
    } catch (error) {
      if (cacheKey) upscaleIdempotencyCache.delete(cacheKey);

      if (error instanceof GenerationError) {
        return { success: false, code: error.code, message: error.message };
      }
      console.error("Upscaling failed:", error);
      return {
        success: false,
        code: "GENERATION_FAILED",
        message: "Something went wrong. Please try again.",
      };
    }
  });

export const getActiveUpscaleModelsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  return listActiveUpscaleModels();
});

// --- Phase 10: Outpaint / Expand ---

export type GenerateOutpaintResult =
  ({ success: true } & GenerateOutpaintOutput) | { success: false; code: string; message: string };

/** Separate idempotency cache — same reasoning as the other tools' above. */
const outpaintIdempotencyCache = new Map<
  string,
  { promise: Promise<GenerateOutpaintOutput>; expiresAt: number }
>();

function pruneExpiredOutpaintIdempotencyEntries() {
  const now = Date.now();
  for (const [key, entry] of outpaintIdempotencyCache) {
    if (entry.expiresAt < now) outpaintIdempotencyCache.delete(key);
  }
}

export const generateOutpaintFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const parsed = generateOutpaintSchema.parse(input);
    const idempotencyKey =
      input && typeof input === "object" && "idempotencyKey" in input
        ? String((input as { idempotencyKey?: unknown }).idempotencyKey ?? "")
        : "";
    return { ...parsed, idempotencyKey };
  })
  .handler(async ({ data }): Promise<GenerateOutpaintResult> => {
    const user = await requireUser();
    const { idempotencyKey, ...generationInput } = data;

    pruneExpiredOutpaintIdempotencyEntries();

    const cacheKey = idempotencyKey ? `${user.id}:${idempotencyKey}` : null;
    const existing = cacheKey ? outpaintIdempotencyCache.get(cacheKey) : undefined;

    const run = () => generateOutpaint({ userId: user.id, ...generationInput });
    const resultPromise = existing?.promise ?? run();

    if (cacheKey && !existing) {
      outpaintIdempotencyCache.set(cacheKey, {
        promise: resultPromise,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      });
    }

    try {
      const result = await resultPromise;
      return { success: true, ...result };
    } catch (error) {
      if (cacheKey) outpaintIdempotencyCache.delete(cacheKey);

      if (error instanceof GenerationError) {
        return { success: false, code: error.code, message: error.message };
      }
      console.error("Outpainting failed:", error);
      return {
        success: false,
        code: "GENERATION_FAILED",
        message: "Something went wrong. Please try again.",
      };
    }
  });

export const getActiveOutpaintModelsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  return listActiveOutpaintModels();
});

// --- Phase 11: Editor / masked inpainting ---

export type GenerateEditorResult =
  ({ success: true } & GenerateEditorOutput) | { success: false; code: string; message: string };

/** Separate idempotency cache — same reasoning as the other tools' above. */
const editorIdempotencyCache = new Map<
  string,
  { promise: Promise<GenerateEditorOutput>; expiresAt: number }
>();

function pruneExpiredEditorIdempotencyEntries() {
  const now = Date.now();
  for (const [key, entry] of editorIdempotencyCache) {
    if (entry.expiresAt < now) editorIdempotencyCache.delete(key);
  }
}

export const generateEditorEditFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const parsed = generateEditorSchema.parse(input);
    const idempotencyKey =
      input && typeof input === "object" && "idempotencyKey" in input
        ? String((input as { idempotencyKey?: unknown }).idempotencyKey ?? "")
        : "";
    return { ...parsed, idempotencyKey };
  })
  .handler(async ({ data }): Promise<GenerateEditorResult> => {
    const user = await requireUser();
    const { idempotencyKey, ...generationInput } = data;

    pruneExpiredEditorIdempotencyEntries();

    const cacheKey = idempotencyKey ? `${user.id}:${idempotencyKey}` : null;
    const existing = cacheKey ? editorIdempotencyCache.get(cacheKey) : undefined;

    const run = () => generateEditorEdit({ userId: user.id, ...generationInput });
    const resultPromise = existing?.promise ?? run();

    if (cacheKey && !existing) {
      editorIdempotencyCache.set(cacheKey, {
        promise: resultPromise,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      });
    }

    try {
      const result = await resultPromise;
      return { success: true, ...result };
    } catch (error) {
      if (cacheKey) editorIdempotencyCache.delete(cacheKey);

      if (error instanceof GenerationError) {
        return { success: false, code: error.code, message: error.message };
      }
      console.error("Editor generation failed:", error);
      return {
        success: false,
        code: "GENERATION_FAILED",
        message: "Something went wrong. Please try again.",
      };
    }
  });

export const getActiveEditorModelsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  return listActiveEditorModels();
});
