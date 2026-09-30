import { z } from "zod";

import {
  MAX_IMAGE_COUNT,
  MAX_PROMPT_LENGTH,
  SUPPORTED_ASPECT_RATIOS,
} from "@/lib/ai/generation.server";

export const generateTextToImageSchema = z.object({
  modelSlug: z.string().min(1, "A model is required."),
  prompt: z
    .string()
    .trim()
    .min(1, "Enter a prompt first.")
    .max(MAX_PROMPT_LENGTH, "Prompt is too long."),
  negativePrompt: z.string().trim().max(MAX_PROMPT_LENGTH).optional(),
  aspectRatio: z.enum(SUPPORTED_ASPECT_RATIOS),
  imageCount: z.coerce.number().int().min(1).max(MAX_IMAGE_COUNT),
});

export type GenerateTextToImageInput = z.infer<typeof generateTextToImageSchema>;

/**
 * `strength` is kept in the UI's 0-100 "reference strength" scale here —
 * generation.server.ts is the single place that converts it into the
 * provider's 0..1 scale, so validation and the conversion math can't
 * drift apart across call sites.
 */
export const generateImageToImageSchema = z.object({
  modelSlug: z.string().min(1, "A model is required."),
  inputAssetId: z.string().uuid("A valid source image is required."),
  prompt: z
    .string()
    .trim()
    .min(1, "Describe the transformation first.")
    .max(MAX_PROMPT_LENGTH, "Prompt is too long."),
  negativePrompt: z.string().trim().max(MAX_PROMPT_LENGTH).optional(),
  referenceStrength: z.coerce.number().int().min(0).max(100).optional(),
  seed: z.coerce
    .number()
    .int()
    .min(0)
    .max(2 ** 32 - 1)
    .optional(),
  aspectRatio: z.string().trim().max(16).optional(),
});

export type GenerateImageToImageInput = z.infer<typeof generateImageToImageSchema>;

/**
 * No prompt: Background Removal is Upload → Remove Background, not a
 * text-driven tool (see remove-background.tsx).
 */
export const generateBackgroundRemovalSchema = z.object({
  modelSlug: z.string().min(1, "A model is required."),
  inputAssetId: z.string().uuid("A valid source image is required."),
});

export type GenerateBackgroundRemovalInput = z.infer<typeof generateBackgroundRemovalSchema>;

/**
 * No prompt here either — Upload → choose factor → Upscale. `factor` is
 * restricted to the two Real-ESRGAN weights the local processor actually
 * ships (see local/upscale.server.ts) — there is no real 8x model, so it
 * is never an accepted value here, not just hidden in the UI.
 */
export const generateUpscaleSchema = z.object({
  modelSlug: z.string().min(1, "A model is required."),
  inputAssetId: z.string().uuid("A valid source image is required."),
  factor: z.union([z.literal(2), z.literal(4)]),
});

export type GenerateUpscaleInput = z.infer<typeof generateUpscaleSchema>;

/**
 * Direction percentages match expand.tsx's existing sliders (0-100,
 * percentage of the ORIGINAL dimension on that side) exactly — see
 * canvas.server.ts for how these become actual pixel amounts, including
 * the safety cap that can proportionally scale everything down for a
 * very large expansion request.
 *
 * `prompt` is required (min 1) here, unlike every other tool — confirmed
 * required by `@cf/runwayml/stable-diffusion-v1-5-inpainting`'s own
 * published schema (see the file-level comment in
 * cloudflare-workers-ai.server.ts), not assumed.
 */
export const generateOutpaintSchema = z.object({
  modelSlug: z.string().min(1, "A model is required."),
  inputAssetId: z.string().uuid("A valid source image is required."),
  prompt: z
    .string()
    .trim()
    .min(1, "Describe what should appear in the new area.")
    .max(MAX_PROMPT_LENGTH, "Prompt is too long."),
  negativePrompt: z.string().trim().max(MAX_PROMPT_LENGTH).optional(),
  left: z.coerce.number().int().min(0).max(100),
  right: z.coerce.number().int().min(0).max(100),
  top: z.coerce.number().int().min(0).max(100),
  bottom: z.coerce.number().int().min(0).max(100),
  seed: z.coerce
    .number()
    .int()
    .min(0)
    .max(2 ** 32 - 1)
    .optional(),
});

export type GenerateOutpaintInput = z.infer<typeof generateOutpaintSchema>;

/**
 * Phase 11: Editor / masked inpainting. `maskImage` is a base64-encoded
 * PNG (no `data:` prefix — the client strips it before sending, see
 * editor.tsx), painted by the user onto a canvas sized to the source
 * image's own natural (post-EXIF-orientation) pixel dimensions.
 *
 * The `.max()` here is a coarse pre-parse safety net against an absurdly
 * oversized request body — the string length in base64 characters, not
 * decoded bytes (~11MB decoded at this cap, generous for any real mask —
 * these are mostly solid black/white and compress extremely well as
 * PNG). The AUTHORITATIVE checks (real dimensions matching the source,
 * real coverage, decodability) happen server-side in
 * buildEditorCanvas() — this is not a substitute for those.
 */
export const generateEditorSchema = z.object({
  modelSlug: z.string().min(1, "A model is required."),
  inputAssetId: z.string().uuid("A valid source image is required."),
  prompt: z
    .string()
    .trim()
    .min(1, "Describe the edit first.")
    .max(MAX_PROMPT_LENGTH, "Prompt is too long."),
  negativePrompt: z.string().trim().max(MAX_PROMPT_LENGTH).optional(),
  maskImage: z
    .string()
    .min(1, "Paint the area you want to change first.")
    .max(15_000_000, "The mask is too large."),
  seed: z.coerce
    .number()
    .int()
    .min(0)
    .max(2 ** 32 - 1)
    .optional(),
});

export type GenerateEditorInput = z.infer<typeof generateEditorSchema>;
