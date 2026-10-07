import { eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { aiModels, creations, generations } from "@/db/schema";
import { checkRateLimit } from "@/lib/auth/rate-limit.server";
import type { AssetPurpose } from "@/lib/storage/types";
import {
  AssetNotFoundError,
  SourceAssetUnavailableError,
  deleteAssetForUser,
  getAssetBufferForUser,
  uploadAsset,
} from "@/lib/storage/storage.server";

import { reserveCredits } from "../credits.server";
import { withDbRetry } from "../db-retry.server";
import { buildEditorCanvas, buildOutpaintCanvas, compositeOutpaintResult } from "./canvas.server";
import { GenerationError } from "./errors.server";
import {
  failGenerationAndRefund,
  markGenerationCompleted,
  markGenerationProcessing,
} from "./lifecycle.server";
import { logPersistFailure } from "./log-safe.server";
import { isBackgroundRemovalSupportedPlatform } from "./local/background-removal.server";
import { isUpscaleSupportedPlatform } from "./local/upscale.server";
import { downloadProviderImage } from "./output.server";
import { getAiProvider } from "./provider.server";

// Kept in sync with src/lib/mock-data.ts's ASPECT_RATIOS — every value
// here must be one flux-schnell (and Replicate image models generally)
// actually accepts as an `aspect_ratio` input.
export const SUPPORTED_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;
export const MAX_IMAGE_COUNT = 4;
export const MAX_PROMPT_LENGTH = 2000;

export type GenerateTextToImageInput = {
  userId: string;
  modelSlug: string;
  prompt: string;
  negativePrompt?: string | undefined;
  aspectRatio: string;
  imageCount: number;
};

export type GenerationCreation = { id: string; url: string; width: number | null; height: number | null };

export type GenerateTextToImageOutput = {
  generationId: string;
  creations: GenerationCreation[];
};

/**
 * Full lifecycle for one text-to-image request:
 *
 *   1. rate limit
 *   2. load + validate the model (must be ACTIVE + text-to-image capable)
 *   3. validate options (aspect ratio, image count) against what the
 *      model/provider actually supports
 *   4. SHORT transaction: create the `generations` row (QUEUED) + reserve
 *      credits + ledger entry — commits before any network call
 *   5. mark PROCESSING, call the provider (no open DB transaction here —
 *      this is the only step that can take real wall-clock time)
 *   6. download each output image server-side, validate + store it via
 *      Phase 5's storage abstraction as a GENERATED_OUTPUT asset, and
 *      create a `creations` row for it
 *   7. mark COMPLETED
 *
 * Any failure from step 5 onward marks the generation FAILED and refunds
 * the reserved credits exactly once (see credits.server.ts). A failure
 * partway through step 6 also cleans up whichever output assets already
 * made it to storage, so nothing is left orphaned.
 */
export async function generateTextToImage(
  input: GenerateTextToImageInput,
): Promise<GenerateTextToImageOutput> {
  const rateLimit = checkRateLimit(`generate:${input.userId}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) {
    throw new GenerationError(
      "RATE_LIMITED",
      "You're generating too quickly. Please wait a moment and try again.",
    );
  }

  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new GenerationError("INVALID_GENERATION_OPTIONS", "Enter a prompt first.");
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new GenerationError("INVALID_GENERATION_OPTIONS", "Prompt is too long.");
  }

  if (!(SUPPORTED_ASPECT_RATIOS as readonly string[]).includes(input.aspectRatio)) {
    throw new GenerationError("INVALID_GENERATION_OPTIONS", "Unsupported aspect ratio.");
  }
  if (!Number.isInteger(input.imageCount) || input.imageCount < 1 || input.imageCount > MAX_IMAGE_COUNT) {
    throw new GenerationError("INVALID_GENERATION_OPTIONS", "Unsupported image count.");
  }

  const [model] = await db.select().from(aiModels).where(eq(aiModels.slug, input.modelSlug));
  if (!model || model.status !== "ACTIVE" || !model.supportsTextToImage || !model.providerModelId) {
    throw new GenerationError("MODEL_NOT_AVAILABLE", "This model isn't available right now.");
  }

  const cost = model.creditCost * input.imageCount;

  const generationId = await db.transaction(async (tx) => {
    const [generation] = await tx
      .insert(generations)
      .values({
        userId: input.userId,
        modelId: model.id,
        type: "TEXT_TO_IMAGE",
        status: "QUEUED",
        prompt,
        negativePrompt: input.negativePrompt || null,
        aspectRatio: input.aspectRatio,
        creditsUsed: cost,
      })
      .returning({ id: generations.id });

    if (!generation) {
      throw new Error("Failed to create generation record.");
    }

    // reserveCredits throws INSUFFICIENT_CREDITS if the balance is too
    // low, which rolls back this whole transaction — including the
    // `generations` insert above — so no orphan QUEUED row is left behind.
    await reserveCredits(tx, input.userId, cost, generation.id, `Text-to-image generation (${model.name})`);

    return generation.id;
  });

  try {
    await markGenerationProcessing(generationId);

    const provider = getAiProvider(model.provider);
    const result = await provider.generateTextToImage(model.providerModelId, {
      prompt,
      negativePrompt: input.negativePrompt,
      aspectRatio: input.aspectRatio,
      imageCount: input.imageCount,
    });

    const persistedAssetIds: string[] = [];
    const createdCreations: GenerationCreation[] = [];

    try {
      for (const image of result.images) {
        const downloaded =
          image.kind === "url"
            ? await downloadProviderImage(image.url)
            : { buffer: Buffer.from(image.base64, "base64"), contentType: image.mimeType ?? "" };

        const asset = await withDbRetry(() =>
          uploadAsset({
            userId: input.userId,
            purpose: "GENERATED_OUTPUT",
            buffer: downloaded.buffer,
            declaredMimeType: downloaded.contentType,
          }),
        );
        persistedAssetIds.push(asset.id);

        const [creation] = await withDbRetry(() =>
          db
            .insert(creations)
            .values({
              userId: input.userId,
              generationId,
              title: prompt.slice(0, 120),
              imageUrl: asset.url,
              mimeType: asset.mimeType,
              width: asset.width,
              height: asset.height,
            })
            .returning(),
        );

        if (!creation) {
          throw new Error("Failed to create creation record.");
        }

        createdCreations.push({
          id: creation.id,
          url: creation.imageUrl,
          width: creation.width,
          height: creation.height,
        });
      }
    } catch (persistError) {
      logPersistFailure(persistError);
      for (const assetId of persistedAssetIds) {
        try {
          await deleteAssetForUser(input.userId, assetId);
        } catch (cleanupError) {
          console.error("Failed to clean up orphaned generated asset:", cleanupError);
        }
      }
      throw persistError instanceof GenerationError
        ? persistError
        : new GenerationError("OUTPUT_STORAGE_FAILED", "Failed to save the generated image.");
    }

    await markGenerationCompleted(generationId, {
      outputImageUrl: createdCreations[0]?.url ?? null,
      providerJobId: result.providerJobId,
    });

    return { generationId, creations: createdCreations };
  } catch (error) {
    const genError =
      error instanceof GenerationError
        ? error
        : new GenerationError("GENERATION_FAILED", "Generation failed. Please try again.");

    if (!(error instanceof GenerationError)) {
      console.error("Unexpected error during generation:", error);
    }

    await failGenerationAndRefund({
      userId: input.userId,
      generationId,
      cost,
      code: genError.code,
      message: genError.message,
    });

    throw genError;
  }
}

// --- Phase 7: Image-to-Image ---

/** Asset purposes accepted as an Image-to-Image source. Never trust a
 * client-supplied storage key/path — the server loads the asset by ID
 * and re-derives everything else (owner, purpose, actual bytes) itself. */
export const IMAGE_TO_IMAGE_INPUT_PURPOSES: readonly AssetPurpose[] = [
  "IMAGE_TO_IMAGE_INPUT",
  "AI_INPUT",
];

export type GenerateImageToImageInput = {
  userId: string;
  modelSlug: string;
  inputAssetId: string;
  prompt: string;
  negativePrompt?: string | undefined;
  /** 0-100, UI scale — see generation.server.ts's conversion below.
   * Only honored by providers/models that document a strength-like
   * parameter; currently none of the active Image-to-Image models do
   * (see cloudflare-workers-ai.server.ts), so this is accepted but
   * unused until one does. */
  referenceStrength?: number | undefined;
  seed?: number | undefined;
  /** e.g. "1:1", "16:9" — passed through as-is; see ImageToImageRequest. */
  aspectRatio?: string | undefined;
};

export type GenerateImageToImageOutput = {
  generationId: string;
  creation: GenerationCreation;
};

/**
 * Full lifecycle for one image-to-image request. Mirrors
 * generateTextToImage's structure/transaction-boundary discipline above
 * exactly, with two Phase 7-specific additions:
 *
 *   - ownership/purpose validation of the source asset happens BEFORE
 *     credit reservation (an invalid/foreign asset id is a client error,
 *     not something the user should be charged then refunded for)
 *   - the provider is resolved (and AI_NOT_CONFIGURED thrown, if
 *     applicable) BEFORE the transaction too, so missing Cloudflare
 *     credentials never reserves credits in the first place
 *
 * Reading the source image's bytes off storage happens AFTER the credit
 * transaction commits (same phase as the provider call) — a storage
 * object that's gone missing between upload and generation is treated
 * like any other post-reservation failure: FAILED + refund exactly once.
 */
export async function generateImageToImage(
  input: GenerateImageToImageInput,
): Promise<GenerateImageToImageOutput> {
  const rateLimit = checkRateLimit(`generate:${input.userId}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) {
    throw new GenerationError(
      "RATE_LIMITED",
      "You're generating too quickly. Please wait a moment and try again.",
    );
  }

  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new GenerationError("INVALID_GENERATION_OPTIONS", "Describe the transformation first.");
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new GenerationError("INVALID_GENERATION_OPTIONS", "Prompt is too long.");
  }

  const [model] = await db.select().from(aiModels).where(eq(aiModels.slug, input.modelSlug));
  if (!model || model.status !== "ACTIVE" || !model.supportsImageToImage || !model.providerModelId) {
    throw new GenerationError("MODEL_NOT_AVAILABLE", "This model isn't available right now.");
  }

  // Resolved here (pre-reservation) specifically so AI_NOT_CONFIGURED —
  // e.g. missing Cloudflare credentials — never touches credits at all,
  // rather than reserving-then-refunding like a mid-generation failure.
  const provider = getAiProvider(model.provider);

  // Ownership + purpose check, also pre-reservation: an asset id that
  // doesn't exist, isn't the caller's, or wasn't uploaded for this purpose
  // is a client error, never charged.
  let sourceAsset: Awaited<ReturnType<typeof getAssetBufferForUser>>["asset"];
  try {
    ({ asset: sourceAsset } = await getAssetBufferForUser(
      input.userId,
      input.inputAssetId,
      // Only ownership + purpose are checked here; the bytes themselves
      // are re-read fresh after the transaction commits (see below) so a
      // long-running credit transaction never holds storage I/O open.
      IMAGE_TO_IMAGE_INPUT_PURPOSES,
    ));
  } catch (error) {
    if (error instanceof AssetNotFoundError) {
      throw new GenerationError(
        "SOURCE_ASSET_NOT_FOUND",
        "Upload a reference image first.",
      );
    }
    if (error instanceof SourceAssetUnavailableError) {
      // The row exists and is owned by this user, but the physical file
      // is already gone — still a pre-reservation failure, so still free.
      throw new GenerationError(
        "SOURCE_ASSET_UNAVAILABLE",
        "The reference image could not be loaded. Please upload it again.",
      );
    }
    throw error;
  }

  // Provider strength is 0..1, "how strongly to transform" (lower = more
  // faithful to the input). The UI's "Reference strength" slider is the
  // opposite framing — higher = keep more of the reference — so it's
  // inverted here, once, in the one place both scales meet.
  const uiReferenceStrength = input.referenceStrength ?? 65;
  const providerStrength = Math.min(1, Math.max(0, 1 - uiReferenceStrength / 100));

  const cost = model.creditCost;

  const generationId = await db.transaction(async (tx) => {
    const [generation] = await tx
      .insert(generations)
      .values({
        userId: input.userId,
        modelId: model.id,
        type: "IMAGE_TO_IMAGE",
        status: "QUEUED",
        prompt,
        negativePrompt: input.negativePrompt || null,
        inputImageUrl: sourceAsset.url,
        seed: input.seed !== undefined ? String(input.seed) : null,
        creditsUsed: cost,
        providerMetadata: { inputAssetId: sourceAsset.id },
      })
      .returning({ id: generations.id });

    if (!generation) {
      throw new Error("Failed to create generation record.");
    }

    // Same atomic, transaction-scoped reservation as text-to-image — see
    // reserveCredits' doc comment for why it MUST be `tx`, not `db`.
    await reserveCredits(
      tx,
      input.userId,
      cost,
      generation.id,
      `Image-to-image generation (${model.name})`,
    );

    return generation.id;
  });

  try {
    await markGenerationProcessing(generationId);

    // Re-read the source bytes fresh here (not reused from the
    // pre-reservation check above) — keeps the credit transaction free of
    // any storage I/O, and re-validates that the object is still there
    // right before it's actually needed.
    let sourceBuffer: Buffer;
    let sourceMimeType: string;
    try {
      const loaded = await getAssetBufferForUser(
        input.userId,
        input.inputAssetId,
        IMAGE_TO_IMAGE_INPUT_PURPOSES,
      );
      sourceBuffer = loaded.buffer;
      sourceMimeType = loaded.mimeType;
    } catch (error) {
      if (error instanceof SourceAssetUnavailableError) {
        throw new GenerationError(
          "SOURCE_ASSET_UNAVAILABLE",
          "The reference image could not be loaded. Please upload it again.",
        );
      }
      throw new GenerationError(
        "SOURCE_ASSET_NOT_FOUND",
        "The reference image is no longer available.",
      );
    }

    const result = await provider.generateImageToImage(model.providerModelId, {
      prompt,
      negativePrompt: input.negativePrompt,
      inputImageBuffer: sourceBuffer,
      inputMimeType: sourceMimeType,
      strength: providerStrength,
      seed: input.seed,
      aspectRatio: input.aspectRatio,
    });

    const firstImage = result.images[0];
    if (!firstImage) {
      throw new GenerationError("PROVIDER_ERROR", "The AI provider returned no output.");
    }

    let persistedAssetId: string | null = null;
    let createdCreation: GenerationCreation;

    try {
      const downloaded =
        firstImage.kind === "url"
          ? await downloadProviderImage(firstImage.url)
          : { buffer: Buffer.from(firstImage.base64, "base64"), contentType: firstImage.mimeType ?? "" };

      const asset = await withDbRetry(() =>
        uploadAsset({
          userId: input.userId,
          purpose: "GENERATED_OUTPUT",
          buffer: downloaded.buffer,
          declaredMimeType: downloaded.contentType,
        }),
      );
      persistedAssetId = asset.id;

      const [creation] = await withDbRetry(() =>
        db
          .insert(creations)
          .values({
            userId: input.userId,
            generationId,
            title: prompt.slice(0, 120),
            imageUrl: asset.url,
            mimeType: asset.mimeType,
            width: asset.width,
            height: asset.height,
          })
          .returning(),
      );

      if (!creation) {
        throw new Error("Failed to create creation record.");
      }

      createdCreation = {
        id: creation.id,
        url: creation.imageUrl,
        width: creation.width,
        height: creation.height,
      };
    } catch (persistError) {
      logPersistFailure(persistError);
      if (persistedAssetId) {
        try {
          await deleteAssetForUser(input.userId, persistedAssetId);
        } catch (cleanupError) {
          console.error("Failed to clean up orphaned generated asset:", cleanupError);
        }
      }
      throw persistError instanceof GenerationError
        ? persistError
        : new GenerationError("OUTPUT_STORAGE_FAILED", "Failed to save the generated image.");
    }

    await markGenerationCompleted(generationId, {
      outputImageUrl: createdCreation.url,
      providerJobId: result.providerJobId,
    });

    return { generationId, creation: createdCreation };
  } catch (error) {
    const genError =
      error instanceof GenerationError
        ? error
        : new GenerationError("GENERATION_FAILED", "Generation failed. Please try again.");

    if (!(error instanceof GenerationError)) {
      console.error("Unexpected error during image-to-image generation:", error);
    }

    await failGenerationAndRefund({
      userId: input.userId,
      generationId,
      cost,
      code: genError.code,
      message: genError.message,
    });

    throw genError;
  }
}

// --- Phase 8: Background Removal ---

export const BACKGROUND_REMOVAL_INPUT_PURPOSES: readonly AssetPurpose[] = [
  "BACKGROUND_REMOVAL_INPUT",
  "AI_INPUT",
];

export type GenerateBackgroundRemovalInput = {
  userId: string;
  modelSlug: string;
  inputAssetId: string;
};

export type GenerateBackgroundRemovalOutput = {
  generationId: string;
  creation: GenerationCreation;
};

/**
 * Same lifecycle/transaction-boundary shape as generateImageToImage
 * above — ownership + model/processor-availability checks before the
 * credit transaction (so an invalid asset or an unsupported platform
 * never charges credits), heavy work (here: local ONNX inference rather
 * than a remote API call) after it commits, FAILED + refund-once on any
 * post-reservation failure. No prompt, no strength — Upload → Remove
 * Background is the whole interaction.
 */
export async function generateBackgroundRemoval(
  input: GenerateBackgroundRemovalInput,
): Promise<GenerateBackgroundRemovalOutput> {
  const rateLimit = checkRateLimit(`generate:${input.userId}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) {
    throw new GenerationError(
      "RATE_LIMITED",
      "You're generating too quickly. Please wait a moment and try again.",
    );
  }

  const [model] = await db.select().from(aiModels).where(eq(aiModels.slug, input.modelSlug));
  if (!model || model.status !== "ACTIVE" || !model.supportsBackgroundRemoval) {
    throw new GenerationError("MODEL_NOT_AVAILABLE", "This model isn't available right now.");
  }

  // Resolved pre-reservation, same reasoning as Image-to-Image: a
  // provider/processor that can't run at all should never charge credits
  // in the first place, rather than reserve-then-refund.
  const provider = getAiProvider(model.provider);
  if (!provider.removeBackground) {
    throw new GenerationError(
      "MODEL_NOT_AVAILABLE",
      "This model doesn't support background removal.",
    );
  }
  if (
    model.provider === "local" &&
    !isBackgroundRemovalSupportedPlatform()
  ) {
    throw new GenerationError(
      "PROCESSOR_UNAVAILABLE",
      "Background removal isn't supported on this server's platform.",
    );
  }

  // Ownership + purpose check, also pre-reservation.
  let sourceAsset: Awaited<ReturnType<typeof getAssetBufferForUser>>["asset"];
  try {
    ({ asset: sourceAsset } = await getAssetBufferForUser(
      input.userId,
      input.inputAssetId,
      BACKGROUND_REMOVAL_INPUT_PURPOSES,
    ));
  } catch (error) {
    if (error instanceof AssetNotFoundError) {
      throw new GenerationError("SOURCE_ASSET_NOT_FOUND", "Upload an image first.");
    }
    if (error instanceof SourceAssetUnavailableError) {
      throw new GenerationError(
        "SOURCE_ASSET_UNAVAILABLE",
        "The image could not be loaded. Please upload it again.",
      );
    }
    throw error;
  }

  const cost = model.creditCost;

  const generationId = await db.transaction(async (tx) => {
    const [generation] = await tx
      .insert(generations)
      .values({
        userId: input.userId,
        modelId: model.id,
        type: "BACKGROUND_REMOVAL",
        status: "QUEUED",
        inputImageUrl: sourceAsset.url,
        creditsUsed: cost,
        providerMetadata: { inputAssetId: sourceAsset.id },
      })
      .returning({ id: generations.id });

    if (!generation) {
      throw new Error("Failed to create generation record.");
    }

    await reserveCredits(
      tx,
      input.userId,
      cost,
      generation.id,
      `Background removal (${model.name})`,
    );

    return generation.id;
  });

  try {
    await markGenerationProcessing(generationId);

    // Re-read the source bytes fresh (not reused from the pre-reservation
    // check) — see generateImageToImage's identical comment above for why.
    let sourceBuffer: Buffer;
    let sourceMimeType: string;
    try {
      const loaded = await getAssetBufferForUser(
        input.userId,
        input.inputAssetId,
        BACKGROUND_REMOVAL_INPUT_PURPOSES,
      );
      sourceBuffer = loaded.buffer;
      sourceMimeType = loaded.mimeType;
    } catch (error) {
      if (error instanceof SourceAssetUnavailableError) {
        throw new GenerationError(
          "SOURCE_ASSET_UNAVAILABLE",
          "The image could not be loaded. Please upload it again.",
        );
      }
      throw new GenerationError("SOURCE_ASSET_NOT_FOUND", "The image is no longer available.");
    }

    const result = await provider.removeBackground(model.providerModelId, {
      inputImageBuffer: sourceBuffer,
      inputMimeType: sourceMimeType,
    });

    const firstImage = result.images[0];
    if (!firstImage) {
      throw new GenerationError("PROVIDER_ERROR", "Background removal returned no output.");
    }

    let persistedAssetId: string | null = null;
    let createdCreation: GenerationCreation;

    try {
      const downloaded =
        firstImage.kind === "url"
          ? await downloadProviderImage(firstImage.url)
          : { buffer: Buffer.from(firstImage.base64, "base64"), contentType: firstImage.mimeType ?? "image/png" };

      const asset = await withDbRetry(() =>
        uploadAsset({
          userId: input.userId,
          purpose: "GENERATED_OUTPUT",
          buffer: downloaded.buffer,
          declaredMimeType: downloaded.contentType,
        }),
      );
      persistedAssetId = asset.id;

      const [creation] = await withDbRetry(() =>
        db
          .insert(creations)
          .values({
            userId: input.userId,
            generationId,
            title: "Background removed",
            imageUrl: asset.url,
            mimeType: asset.mimeType,
            width: asset.width,
            height: asset.height,
          })
          .returning(),
      );

      if (!creation) {
        throw new Error("Failed to create creation record.");
      }

      createdCreation = {
        id: creation.id,
        url: creation.imageUrl,
        width: creation.width,
        height: creation.height,
      };
    } catch (persistError) {
      logPersistFailure(persistError);
      if (persistedAssetId) {
        try {
          await deleteAssetForUser(input.userId, persistedAssetId);
        } catch (cleanupError) {
          console.error("Failed to clean up orphaned generated asset:", cleanupError);
        }
      }
      throw persistError instanceof GenerationError
        ? persistError
        : new GenerationError("OUTPUT_STORAGE_FAILED", "Failed to save the processed image.");
    }

    await markGenerationCompleted(generationId, {
      outputImageUrl: createdCreation.url,
      providerJobId: result.providerJobId,
    });

    return { generationId, creation: createdCreation };
  } catch (error) {
    const genError =
      error instanceof GenerationError
        ? error
        : new GenerationError("GENERATION_FAILED", "Background removal failed. Please try again.");

    if (!(error instanceof GenerationError)) {
      console.error("Unexpected error during background removal:", error);
    }

    await failGenerationAndRefund({
      userId: input.userId,
      generationId,
      cost,
      code: genError.code,
      message: genError.message,
    });

    throw genError;
  }
}

// --- Phase 9: Upscale ---

export const UPSCALE_INPUT_PURPOSES: readonly AssetPurpose[] = ["UPSCALE_INPUT", "AI_INPUT"];

export type GenerateUpscaleInput = {
  userId: string;
  modelSlug: string;
  inputAssetId: string;
  factor: 2 | 4;
};

export type GenerateUpscaleOutput = {
  generationId: string;
  creation: GenerationCreation;
  outputWidth: number;
  outputHeight: number;
  wasDownscaled: boolean;
};

/**
 * Same lifecycle shape as Background Removal above: ownership +
 * processor-availability checks before the credit transaction, heavy
 * local ONNX work after it commits, FAILED + refund-once on any
 * post-reservation failure. `factor` changes the charged cost (see the
 * pre-reservation cost calculation below) but not the flow.
 */
export async function generateUpscale(input: GenerateUpscaleInput): Promise<GenerateUpscaleOutput> {
  const rateLimit = checkRateLimit(`generate:${input.userId}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) {
    throw new GenerationError(
      "RATE_LIMITED",
      "You're generating too quickly. Please wait a moment and try again.",
    );
  }

  const [model] = await db.select().from(aiModels).where(eq(aiModels.slug, input.modelSlug));
  if (!model || model.status !== "ACTIVE" || !model.supportsUpscale) {
    throw new GenerationError("MODEL_NOT_AVAILABLE", "This model isn't available right now.");
  }

  const provider = getAiProvider(model.provider);
  if (!provider.upscaleImage) {
    throw new GenerationError("MODEL_NOT_AVAILABLE", "This model doesn't support upscaling.");
  }
  if (model.provider === "local" && !isUpscaleSupportedPlatform()) {
    throw new GenerationError(
      "PROCESSOR_UNAVAILABLE",
      "Upscaling isn't supported on this server's platform.",
    );
  }

  let sourceAsset: Awaited<ReturnType<typeof getAssetBufferForUser>>["asset"];
  try {
    ({ asset: sourceAsset } = await getAssetBufferForUser(
      input.userId,
      input.inputAssetId,
      UPSCALE_INPUT_PURPOSES,
    ));
  } catch (error) {
    if (error instanceof AssetNotFoundError) {
      throw new GenerationError("SOURCE_ASSET_NOT_FOUND", "Upload an image first.");
    }
    if (error instanceof SourceAssetUnavailableError) {
      throw new GenerationError(
        "SOURCE_ASSET_UNAVAILABLE",
        "The image could not be loaded. Please upload it again.",
      );
    }
    throw error;
  }

  // 4x costs more than 2x — same core per-pixel compute, but produces a
  // larger output and is the "premium" option from the user's
  // perspective. Computed here, server-side, rather than a second
  // ai_models row, so both factors share one real, verified model row.
  const cost = input.factor === 4 ? model.creditCost * 2 : model.creditCost;

  const generationId = await db.transaction(async (tx) => {
    const [generation] = await tx
      .insert(generations)
      .values({
        userId: input.userId,
        modelId: model.id,
        type: "UPSCALE",
        status: "QUEUED",
        inputImageUrl: sourceAsset.url,
        creditsUsed: cost,
        providerMetadata: { inputAssetId: sourceAsset.id, factor: input.factor },
      })
      .returning({ id: generations.id });

    if (!generation) {
      throw new Error("Failed to create generation record.");
    }

    await reserveCredits(tx, input.userId, cost, generation.id, `Upscale ${input.factor}x (${model.name})`);

    return generation.id;
  });

  try {
    await markGenerationProcessing(generationId);

    let sourceBuffer: Buffer;
    let sourceMimeType: string;
    try {
      const loaded = await getAssetBufferForUser(input.userId, input.inputAssetId, UPSCALE_INPUT_PURPOSES);
      sourceBuffer = loaded.buffer;
      sourceMimeType = loaded.mimeType;
    } catch (error) {
      if (error instanceof SourceAssetUnavailableError) {
        throw new GenerationError(
          "SOURCE_ASSET_UNAVAILABLE",
          "The image could not be loaded. Please upload it again.",
        );
      }
      throw new GenerationError("SOURCE_ASSET_NOT_FOUND", "The image is no longer available.");
    }

    const result = await provider.upscaleImage(model.providerModelId, {
      inputImageBuffer: sourceBuffer,
      inputMimeType: sourceMimeType,
      factor: input.factor,
    });

    const firstImage = result.images[0];
    if (!firstImage) {
      throw new GenerationError("PROVIDER_ERROR", "Upscaling returned no output.");
    }

    let persistedAssetId: string | null = null;
    let createdCreation: GenerationCreation;

    try {
      const downloaded =
        firstImage.kind === "url"
          ? await downloadProviderImage(firstImage.url)
          : { buffer: Buffer.from(firstImage.base64, "base64"), contentType: firstImage.mimeType ?? "image/png" };

      const asset = await withDbRetry(() =>
        uploadAsset({
          userId: input.userId,
          purpose: "GENERATED_OUTPUT",
          buffer: downloaded.buffer,
          declaredMimeType: downloaded.contentType,
        }),
      );
      persistedAssetId = asset.id;

      const [creation] = await withDbRetry(() =>
        db
          .insert(creations)
          .values({
            userId: input.userId,
            generationId,
            title: `Upscaled ${input.factor}x`,
            imageUrl: asset.url,
            mimeType: asset.mimeType,
            width: asset.width,
            height: asset.height,
          })
          .returning(),
      );

      if (!creation) {
        throw new Error("Failed to create creation record.");
      }

      createdCreation = {
        id: creation.id,
        url: creation.imageUrl,
        width: creation.width,
        height: creation.height,
      };
    } catch (persistError) {
      logPersistFailure(persistError);
      if (persistedAssetId) {
        try {
          await deleteAssetForUser(input.userId, persistedAssetId);
        } catch (cleanupError) {
          console.error("Failed to clean up orphaned generated asset:", cleanupError);
        }
      }
      throw persistError instanceof GenerationError
        ? persistError
        : new GenerationError("OUTPUT_STORAGE_FAILED", "Failed to save the upscaled image.");
    }

    await markGenerationCompleted(generationId, {
      outputImageUrl: createdCreation.url,
      providerJobId: result.providerJobId,
    });

    return {
      generationId,
      creation: createdCreation,
      outputWidth: result.outputWidth,
      outputHeight: result.outputHeight,
      wasDownscaled: result.wasDownscaled,
    };
  } catch (error) {
    const genError =
      error instanceof GenerationError
        ? error
        : new GenerationError("GENERATION_FAILED", "Upscaling failed. Please try again.");

    if (!(error instanceof GenerationError)) {
      console.error("Unexpected error during upscaling:", error);
    }

    await failGenerationAndRefund({
      userId: input.userId,
      generationId,
      cost,
      code: genError.code,
      message: genError.message,
    });

    throw genError;
  }
}

// --- Phase 10: Outpaint / Expand ---

export const OUTPAINT_INPUT_PURPOSES: readonly AssetPurpose[] = ["OUTPAINT_INPUT", "AI_INPUT"];

export type GenerateOutpaintInput = {
  userId: string;
  modelSlug: string;
  inputAssetId: string;
  prompt: string;
  negativePrompt?: string | undefined;
  /** 0-100 each, percentage of the ORIGINAL dimension on that side. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  seed?: number | undefined;
};

export type GenerateOutpaintOutput = {
  generationId: string;
  creation: GenerationCreation;
  outputWidth: number;
  outputHeight: number;
  wasDownscaled: boolean;
};

/**
 * Same lifecycle shape as every other Phase 8/9/10 tool: ownership +
 * model-availability checks before the credit transaction, heavy work
 * (canvas/mask construction, then the actual Cloudflare inpainting call)
 * after it commits, FAILED + refund-once on any post-reservation
 * failure. Canvas/mask construction itself (see canvas.server.ts) is
 * local, fast, sharp-only work — the only network call is the single
 * request to Cloudflare's inpainting model.
 */
export async function generateOutpaint(input: GenerateOutpaintInput): Promise<GenerateOutpaintOutput> {
  const rateLimit = checkRateLimit(`generate:${input.userId}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) {
    throw new GenerationError(
      "RATE_LIMITED",
      "You're generating too quickly. Please wait a moment and try again.",
    );
  }

  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new GenerationError("INVALID_GENERATION_OPTIONS", "Describe what should appear in the new area.");
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new GenerationError("INVALID_GENERATION_OPTIONS", "Prompt is too long.");
  }
  if (input.left + input.right + input.top + input.bottom === 0) {
    throw new GenerationError("INVALID_GENERATION_OPTIONS", "Choose at least one side to expand.");
  }

  const [model] = await db.select().from(aiModels).where(eq(aiModels.slug, input.modelSlug));
  if (!model || model.status !== "ACTIVE" || !model.supportsOutpainting || !model.providerModelId) {
    throw new GenerationError("MODEL_NOT_AVAILABLE", "This model isn't available right now.");
  }

  const provider = getAiProvider(model.provider);
  if (!provider.outpaintImage) {
    throw new GenerationError("MODEL_NOT_AVAILABLE", "This model doesn't support expand/outpainting.");
  }

  let sourceAsset: Awaited<ReturnType<typeof getAssetBufferForUser>>["asset"];
  try {
    ({ asset: sourceAsset } = await getAssetBufferForUser(
      input.userId,
      input.inputAssetId,
      OUTPAINT_INPUT_PURPOSES,
    ));
  } catch (error) {
    if (error instanceof AssetNotFoundError) {
      throw new GenerationError("SOURCE_ASSET_NOT_FOUND", "Upload an image first.");
    }
    if (error instanceof SourceAssetUnavailableError) {
      throw new GenerationError(
        "SOURCE_ASSET_UNAVAILABLE",
        "The image could not be loaded. Please upload it again.",
      );
    }
    throw error;
  }

  const cost = model.creditCost;

  const generationId = await db.transaction(async (tx) => {
    const [generation] = await tx
      .insert(generations)
      .values({
        userId: input.userId,
        modelId: model.id,
        type: "OUTPAINT",
        status: "QUEUED",
        prompt,
        negativePrompt: input.negativePrompt || null,
        inputImageUrl: sourceAsset.url,
        seed: input.seed !== undefined ? String(input.seed) : null,
        creditsUsed: cost,
        providerMetadata: {
          inputAssetId: sourceAsset.id,
          expand: { left: input.left, right: input.right, top: input.top, bottom: input.bottom },
        },
      })
      .returning({ id: generations.id });

    if (!generation) {
      throw new Error("Failed to create generation record.");
    }

    await reserveCredits(tx, input.userId, cost, generation.id, `Expand/outpaint (${model.name})`);

    return generation.id;
  });

  try {
    await markGenerationProcessing(generationId);

    let sourceBuffer: Buffer;
    try {
      const loaded = await getAssetBufferForUser(input.userId, input.inputAssetId, OUTPAINT_INPUT_PURPOSES);
      sourceBuffer = loaded.buffer;
    } catch (error) {
      if (error instanceof SourceAssetUnavailableError) {
        throw new GenerationError(
          "SOURCE_ASSET_UNAVAILABLE",
          "The image could not be loaded. Please upload it again.",
        );
      }
      throw new GenerationError("SOURCE_ASSET_NOT_FOUND", "The image is no longer available.");
    }

    const { canvasBuffer, maskBuffer, targetWidth, targetHeight, wasDownscaled } = await buildOutpaintCanvas(
      sourceBuffer,
      { left: input.left, right: input.right, top: input.top, bottom: input.bottom },
    );

    const result = await provider.outpaintImage(model.providerModelId, {
      canvasBuffer,
      maskBuffer,
      prompt,
      negativePrompt: input.negativePrompt,
      seed: input.seed,
    });

    const firstImage = result.images[0];
    if (!firstImage) {
      throw new GenerationError("PROVIDER_ERROR", "Outpainting returned no output.");
    }

    const downloadedModelOutput =
      firstImage.kind === "url"
        ? (await downloadProviderImage(firstImage.url)).buffer
        : Buffer.from(firstImage.base64, "base64");

    const finalOutputBuffer = await compositeOutpaintResult(
      downloadedModelOutput,
      canvasBuffer,
      maskBuffer,
      targetWidth,
      targetHeight,
    );

    let persistedAssetId: string | null = null;
    let createdCreation: GenerationCreation;

    try {
      const asset = await withDbRetry(() =>
        uploadAsset({
          userId: input.userId,
          purpose: "GENERATED_OUTPUT",
          buffer: finalOutputBuffer,
          declaredMimeType: "image/png",
        }),
      );
      persistedAssetId = asset.id;

      const [creation] = await withDbRetry(() =>
        db
          .insert(creations)
          .values({
            userId: input.userId,
            generationId,
            title: prompt.slice(0, 120),
            imageUrl: asset.url,
            mimeType: asset.mimeType,
            width: asset.width,
            height: asset.height,
          })
          .returning(),
      );

      if (!creation) {
        throw new Error("Failed to create creation record.");
      }

      createdCreation = {
        id: creation.id,
        url: creation.imageUrl,
        width: creation.width,
        height: creation.height,
      };
    } catch (persistError) {
      logPersistFailure(persistError);
      if (persistedAssetId) {
        try {
          await deleteAssetForUser(input.userId, persistedAssetId);
        } catch (cleanupError) {
          console.error("Failed to clean up orphaned generated asset:", cleanupError);
        }
      }
      throw persistError instanceof GenerationError
        ? persistError
        : new GenerationError("OUTPUT_STORAGE_FAILED", "Failed to save the expanded image.");
    }

    await markGenerationCompleted(generationId, {
      outputImageUrl: createdCreation.url,
      providerJobId: result.providerJobId,
    });

    return { generationId, creation: createdCreation, outputWidth: targetWidth, outputHeight: targetHeight, wasDownscaled };
  } catch (error) {
    const genError =
      error instanceof GenerationError
        ? error
        : new GenerationError("GENERATION_FAILED", "Outpainting failed. Please try again.");

    if (!(error instanceof GenerationError)) {
      console.error("Unexpected error during outpainting:", error);
    }

    await failGenerationAndRefund({
      userId: input.userId,
      generationId,
      cost,
      code: genError.code,
      message: genError.message,
    });

    throw genError;
  }
}

// --- Phase 11: Editor / masked inpainting ---

export const EDITOR_INPUT_PURPOSES: readonly AssetPurpose[] = ["EDITOR_INPUT", "AI_INPUT"];

export type GenerateEditorInput = {
  userId: string;
  modelSlug: string;
  inputAssetId: string;
  prompt: string;
  negativePrompt?: string | undefined;
  /** Base64 PNG, no `data:` prefix -- see generateEditorSchema's doc
   * comment for the exact contract the client must satisfy. */
  maskImage: string;
  seed?: number | undefined;
};

export type GenerateEditorOutput = {
  generationId: string;
  creation: GenerationCreation;
  outputWidth: number;
  outputHeight: number;
  wasDownscaled: boolean;
};

/**
 * Same lifecycle shape as generateOutpaint above, and deliberately reuses
 * its exact provider call (`provider.outpaintImage()` -- see the
 * file-level comment in canvas.server.ts's Phase 11 section for why the
 * SAME Cloudflare inpainting model/request format works unchanged for
 * both outpainting and in-place masked editing; only the canvas/mask
 * CONSTRUCTION differs, in buildEditorCanvas()).
 *
 * Ownership, mask validity (dimensions, non-empty, coverage cap), model
 * availability, and prompt validity are all checked BEFORE credits are
 * reserved (spec Section 30) -- a bad mask or a bad prompt never costs the
 * user anything. The mask is decoded/validated here once for that
 * pre-charge check, then re-validated (cheaply -- local sharp work only)
 * inside buildEditorCanvas() again after the source is re-fetched
 * post-charge, exactly mirroring how generateOutpaint re-fetches its
 * source asset after reserving credits (so a source deleted between the
 * two fetches still fails cleanly and refunds, per spec Section 63's
 * storage-failure test).
 */
export async function generateEditorEdit(input: GenerateEditorInput): Promise<GenerateEditorOutput> {
  const rateLimit = checkRateLimit(`generate:${input.userId}`, { max: 20, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) {
    throw new GenerationError(
      "RATE_LIMITED",
      "You're generating too quickly. Please wait a moment and try again.",
    );
  }

  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new GenerationError("INVALID_GENERATION_OPTIONS", "Describe the edit first.");
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new GenerationError("INVALID_GENERATION_OPTIONS", "Prompt is too long.");
  }

  let rawMaskBuffer: Buffer;
  try {
    rawMaskBuffer = Buffer.from(input.maskImage, "base64");
  } catch {
    throw new GenerationError("INVALID_MASK", "The mask image could not be read.");
  }
  if (rawMaskBuffer.byteLength === 0) {
    throw new GenerationError("EMPTY_EDIT_MASK", "Paint the area you want to change first.");
  }

  const [model] = await db.select().from(aiModels).where(eq(aiModels.slug, input.modelSlug));
  if (!model || model.status !== "ACTIVE" || model.type !== "EDITOR" || !model.providerModelId) {
    throw new GenerationError("MODEL_NOT_AVAILABLE", "This model isn't available right now.");
  }

  const provider = getAiProvider(model.provider);
  if (!provider.outpaintImage) {
    throw new GenerationError("MODEL_NOT_AVAILABLE", "This model doesn't support editing.");
  }

  let sourceAsset: Awaited<ReturnType<typeof getAssetBufferForUser>>["asset"];
  let sourceBufferForValidation: Buffer;
  try {
    ({ asset: sourceAsset, buffer: sourceBufferForValidation } = await getAssetBufferForUser(
      input.userId,
      input.inputAssetId,
      EDITOR_INPUT_PURPOSES,
    ));
  } catch (error) {
    if (error instanceof AssetNotFoundError) {
      throw new GenerationError("SOURCE_ASSET_NOT_FOUND", "Upload an image first.");
    }
    if (error instanceof SourceAssetUnavailableError) {
      throw new GenerationError(
        "SOURCE_ASSET_UNAVAILABLE",
        "The image could not be loaded. Please upload it again.",
      );
    }
    throw error;
  }

  // Pre-charge validation only -- throws EMPTY_EDIT_MASK/INVALID_MASK
  // before any credits are reserved. The result itself is discarded;
  // the real canvas/mask used for generation is rebuilt post-charge from
  // a freshly re-fetched source (see below), same pattern as
  // generateOutpaint.
  const maskCheck = await buildEditorCanvas(sourceBufferForValidation, rawMaskBuffer);

  const cost = model.creditCost;

  const generationId = await db.transaction(async (tx) => {
    const [generation] = await tx
      .insert(generations)
      .values({
        userId: input.userId,
        modelId: model.id,
        type: "EDITOR",
        status: "QUEUED",
        prompt,
        negativePrompt: input.negativePrompt || null,
        inputImageUrl: sourceAsset.url,
        seed: input.seed !== undefined ? String(input.seed) : null,
        creditsUsed: cost,
        providerMetadata: {
          inputAssetId: sourceAsset.id,
          operation: "editor",
          maskCoveragePercent: Math.round(maskCheck.maskCoveragePercent * 100) / 100,
        },
      })
      .returning({ id: generations.id });

    if (!generation) {
      throw new Error("Failed to create generation record.");
    }

    await reserveCredits(tx, input.userId, cost, generation.id, `AI Editor edit (${model.name})`);

    return generation.id;
  });

  try {
    await markGenerationProcessing(generationId);

    let sourceBuffer: Buffer;
    try {
      const loaded = await getAssetBufferForUser(input.userId, input.inputAssetId, EDITOR_INPUT_PURPOSES);
      sourceBuffer = loaded.buffer;
    } catch (error) {
      if (error instanceof SourceAssetUnavailableError) {
        throw new GenerationError(
          "SOURCE_ASSET_UNAVAILABLE",
          "The image could not be loaded. Please upload it again.",
        );
      }
      throw new GenerationError("SOURCE_ASSET_NOT_FOUND", "The image is no longer available.");
    }

    const { canvasBuffer, maskBuffer, targetWidth, targetHeight, wasDownscaled } = await buildEditorCanvas(
      sourceBuffer,
      rawMaskBuffer,
    );

    const result = await provider.outpaintImage(model.providerModelId, {
      canvasBuffer,
      maskBuffer,
      prompt,
      negativePrompt: input.negativePrompt,
      seed: input.seed,
    });

    const firstImage = result.images[0];
    if (!firstImage) {
      throw new GenerationError("PROVIDER_ERROR", "The edit returned no output.");
    }

    const downloadedModelOutput =
      firstImage.kind === "url"
        ? (await downloadProviderImage(firstImage.url)).buffer
        : Buffer.from(firstImage.base64, "base64");

    // Reused unchanged from Phase 10 -- see canvas.server.ts's Phase 11
    // comment for why the same compositing logic (preserve everything
    // outside the feathered mask, pixel-for-pixel) applies identically
    // here despite the mask marking an internal selection rather than a
    // newly-expanded border.
    const finalOutputBuffer = await compositeOutpaintResult(
      downloadedModelOutput,
      canvasBuffer,
      maskBuffer,
      targetWidth,
      targetHeight,
    );

    let persistedAssetId: string | null = null;
    let createdCreation: GenerationCreation;

    try {
      const asset = await withDbRetry(() =>
        uploadAsset({
          userId: input.userId,
          purpose: "GENERATED_OUTPUT",
          buffer: finalOutputBuffer,
          declaredMimeType: "image/png",
        }),
      );
      persistedAssetId = asset.id;

      const [creation] = await withDbRetry(() =>
        db
          .insert(creations)
          .values({
            userId: input.userId,
            generationId,
            title: prompt.slice(0, 120),
            imageUrl: asset.url,
            mimeType: asset.mimeType,
            width: asset.width,
            height: asset.height,
          })
          .returning(),
      );

      if (!creation) {
        throw new Error("Failed to create creation record.");
      }

      createdCreation = {
        id: creation.id,
        url: creation.imageUrl,
        width: creation.width,
        height: creation.height,
      };
    } catch (persistError) {
      logPersistFailure(persistError);
      if (persistedAssetId) {
        try {
          await deleteAssetForUser(input.userId, persistedAssetId);
        } catch (cleanupError) {
          console.error("Failed to clean up orphaned generated asset:", cleanupError);
        }
      }
      throw persistError instanceof GenerationError
        ? persistError
        : new GenerationError("OUTPUT_STORAGE_FAILED", "Failed to save the edited image.");
    }

    await markGenerationCompleted(generationId, {
      outputImageUrl: createdCreation.url,
      providerJobId: result.providerJobId,
    });

    return {
      generationId,
      creation: createdCreation,
      outputWidth: targetWidth,
      outputHeight: targetHeight,
      wasDownscaled,
    };
  } catch (error) {
    const genError =
      error instanceof GenerationError
        ? error
        : new GenerationError("GENERATION_FAILED", "The edit failed. Please try again.");

    if (!(error instanceof GenerationError)) {
      console.error("Unexpected error during editor generation:", error);
    }

    await failGenerationAndRefund({
      userId: input.userId,
      generationId,
      cost,
      code: genError.code,
      message: genError.message,
    });

    throw genError;
  }
}