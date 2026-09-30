import Replicate from "replicate";

import { env } from "@/lib/env.server";

import { GenerationError } from "../errors.server";
import type {
  AiProvider,
  ImageToImageRequest,
  ImageToImageResult,
  TextToImageRequest,
  TextToImageResult,
} from "../types";

/**
 * NOTE ON UNCERTAINTY: the `replicate` SDK's `run()` output shape has
 * changed across versions — older versions resolve plain URL strings,
 * newer ones resolve "FileOutput" objects exposing a `.url()` method (and
 * sometimes a `.url` string property instead). This function handles both
 * shapes defensively. If real generations ever come back with zero images
 * despite Replicate's own dashboard showing a successful prediction, this
 * is the first place to check — everything else in the pipeline (credit
 * handling, download, storage, DB persistence) does not depend on which
 * shape it turned out to be.
 */
function extractImageUrls(output: unknown): string[] {
  const items = Array.isArray(output) ? output : [output];
  const urls: string[] = [];

  for (const item of items) {
    if (item == null) continue;

    if (typeof item === "string") {
      urls.push(item);
      continue;
    }

    if (typeof item === "object") {
      const maybeUrl = (item as { url?: unknown }).url;
      if (typeof maybeUrl === "function") {
        try {
          urls.push(String((maybeUrl as () => unknown).call(item)));
          continue;
        } catch {
          // fall through — try the other shape below
        }
      }
      if (typeof maybeUrl === "string") {
        urls.push(maybeUrl);
      }
    }
  }

  return urls;
}

function isLikelySafetyRejection(message: string): boolean {
  return /nsfw|flagged|safety|content policy|moderation/i.test(message);
}

export function createReplicateProvider(): AiProvider {
  if (!env.REPLICATE_API_TOKEN) {
    throw new GenerationError("AI_NOT_CONFIGURED", "AI generation is not configured.");
  }

  const client = new Replicate({ auth: env.REPLICATE_API_TOKEN });

  return {
    name: "replicate",
    async generateTextToImage(
      providerModelId: string,
      request: TextToImageRequest,
    ): Promise<TextToImageResult> {
      let output: unknown;

      try {
        output = await client.run(providerModelId as `${string}/${string}`, {
          input: {
            prompt: request.prompt,
            ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
            aspect_ratio: request.aspectRatio,
            num_outputs: request.imageCount,
            ...(request.seed !== undefined ? { seed: request.seed } : {}),
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Replicate request failed:", message);

        if (isLikelySafetyRejection(message)) {
          throw new GenerationError(
            "PROVIDER_REJECTED",
            "This prompt was rejected by the AI provider's content safety system.",
          );
        }
        throw new GenerationError("PROVIDER_ERROR", "The AI provider request failed.");
      }

      const urls = extractImageUrls(output);
      if (urls.length === 0) {
        throw new GenerationError("PROVIDER_ERROR", "The AI provider returned no output.");
      }

      return {
        // `replicate.run()` does not surface the prediction id directly —
        // a known simplification for this phase (see the file-level
        // comment). Debugging can still use the model id + timestamp from
        // the `generations` row itself.
        providerJobId: null,
        images: urls.map((url) => ({ kind: "url" as const, url })),
      };
    },

    /**
     * No `ai_models` row currently points at `provider: "replicate"` for
     * IMAGE_TO_IMAGE (Phase 7 uses Cloudflare Workers AI — see
     * cloudflare-workers-ai.server.ts for the verified real model), so
     * this is never actually invoked today. It's implemented only to
     * satisfy the shared `AiProvider` interface. UNVERIFIED, same
     * uncertainty tier as this file's text-to-image output-shape note
     * above: `image` as a data-URI string is a common convention across
     * several Replicate img2img models but has NOT been confirmed against
     * a specific model here. Do not activate a `replicate` IMAGE_TO_IMAGE
     * row without first checking that model's actual input schema.
     */
    async generateImageToImage(
      providerModelId: string,
      request: ImageToImageRequest,
    ): Promise<ImageToImageResult> {
      let output: unknown;

      try {
        output = await client.run(providerModelId as `${string}/${string}`, {
          input: {
            prompt: request.prompt,
            ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
            image: `data:${request.inputMimeType};base64,${request.inputImageBuffer.toString("base64")}`,
            ...(request.strength !== undefined ? { strength: request.strength } : {}),
            ...(request.seed !== undefined ? { seed: request.seed } : {}),
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Replicate image-to-image request failed:", message);

        if (isLikelySafetyRejection(message)) {
          throw new GenerationError(
            "PROVIDER_REJECTED",
            "This prompt was rejected by the AI provider's content safety system.",
          );
        }
        throw new GenerationError("PROVIDER_ERROR", "The AI provider request failed.");
      }

      const urls = extractImageUrls(output);
      if (urls.length === 0) {
        throw new GenerationError("PROVIDER_ERROR", "The AI provider returned no output.");
      }

      return { providerJobId: null, images: urls.map((url) => ({ kind: "url" as const, url })) };
    },
  };
}
