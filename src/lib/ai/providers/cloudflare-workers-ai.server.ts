import { env } from "@/lib/env.server";

import { GenerationError } from "../errors.server";

/**
 * PHASE 14: bound every Workers AI call. Without a timeout a hung upstream
 * request keeps credits reserved until the platform kills the function,
 * and a killed function never reaches the refund path. Keep this BELOW the
 * hosting platform's function duration limit (see docs/PRODUCTION.md).
 */
const CLOUDFLARE_REQUEST_TIMEOUT_MS = 90_000;
import type {
  AiProvider,
  ImageToImageRequest,
  ImageToImageResult,
  OutpaintRequest,
  OutpaintResult,
  TextToImageRequest,
  TextToImageResult,
} from "../types";

/**
 * PHASE 7 MODEL VERIFICATION — history kept because two prior choices
 * both failed against a real account, for two different reasons; do not
 * repeat either without re-reading this:
 *
 * 1. flux-1-schnell (Phase 6's text-to-image model): no image-conditioned
 *    input documented at all. Never viable.
 * 2. `@cf/bytedance/stable-diffusion-xl-lightning`: docs list `image` /
 *    `image_b64`, but a live call with EITHER form returned the same
 *    `AiError 3030: input tensor "image" is not present in the model` —
 *    the model's actual deployed graph doesn't implement img2img despite
 *    the docs page.
 * 3. `@cf/runwayml/stable-diffusion-v1-5-img2img`: Cloudflare's own 2024
 *    catalog-announcement blog names this as the real dedicated img2img
 *    model (SDXL-Lightning was introduced as text-to-image only in that
 *    same release), and multiple independent working integrations
 *    confirm it functions for other accounts — but a live call against
 *    THIS account returned `AiError 5018: This account is not allowed to
 *    access @cf/runwayml/stable-diffusion-v1-5-img2img` (an
 *    account-entitlement error, not a code or format problem).
 *
 * **Now using `pruna/p-image-edit`** — confirmed present and accessible
 * in this account's own model catalog (Cloudflare dashboard → AI →
 * Models, checked during this phase) and documented at
 * developers.cloudflare.com/ai/models/pruna/p-image-edit/. This model
 * lives on Cloudflare's newer **Unified Inference API**, a different
 * surface from the classic `@cf/...` REST pattern used above for
 * flux-1-schnell:
 *   - Endpoint is `POST /accounts/{id}/ai/run` (no model in the URL —
 *     see the fixed `endpoint` below, distinct from the `.../ai/run/
 *     {providerModelId}` pattern generateTextToImage uses)
 *   - Body is `{ model: "<id>", input: { ...params } }`
 *   - `input.images` (array, 1-5 entries): each entry is a URL OR a
 *     base64/data-URI string (confirmed both by Pruna's own docs and by
 *     Cloudflare's published `openai/gpt-image-2` example on this same
 *     Unified endpoint, which sends a full `data:image/png;base64,...`
 *     URI). A data URI is used here — critical for Phase 7, since it
 *     means a private/local-storage source image never needs a public
 *     URL for Cloudflare to fetch, unlike a URL-only input would require
 *   - `input.aspect_ratio` (optional, enum incl. 1:1/16:9/9:16/4:3/3:4)
 *   - No documented `strength`, `negative_prompt`, or `seed` for this
 *     model — it's a prompt-driven edit model (more like Flux Kontext
 *     than classic SD img2img), not a diffusion-strength slider. Those
 *     fields are deliberately NOT sent (an undocumented field could fail
 *     this endpoint's schema validation) — see image-to-image.tsx, where
 *     the "Reference strength" control is now shown disabled for the
 *     same reason `Style strength` already was.
 *
 * OUTPUT SHAPE: every published Unified-endpoint example returns
 * `{ state: "Completed", result: { image: "<url>" }, gatewayMetadata }`
 * synchronously — a hosted URL, NOT inline bytes like flux-1-schnell's
 * `{result: {image: <base64>}}`. Downloaded via the existing `kind: "url"`
 * path in generation.server.ts (downloadProviderImage).
 */
const PRUNA_SUPPORTED_ASPECT_RATIOS = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]);

/**
 * NOTE ON UNCERTAINTY: this is a second, independently-flagged uncertain
 * area (same tier as Replicate's output-shape handling in
 * replicate.server.ts). Cloudflare's own docs
 * (developers.cloudflare.com/workers-ai/models/flux-1-schnell/) confirm
 * the model id, the REST endpoint shape, and `prompt`/`seed`/`steps` as
 * inputs — but the exact JSON shape of a raw REST API response (as
 * opposed to the `env.AI.run()` binding available only from inside an
 * actual Cloudflare Worker, which is NOT what this Node server uses) was
 * inferred from Cloudflare's standard `{success, result, errors}` REST
 * envelope convention rather than confirmed against a real response
 * during authoring. extractInlineImage() below checks several plausible
 * shapes defensively. If a generation reports success server-side but no
 * image ends up stored, this is the first file to check — log the raw
 * `data` object at the marked spot.
 *
 * Also note: flux-1-schnell's documented inputs don't include a
 * width/height or aspect-ratio parameter, so `aspectRatio` is accepted by
 * this provider's function signature (to satisfy the shared `AiProvider`
 * interface) but not actually sent — every image comes back in the
 * model's own default proportions regardless of the UI's aspect ratio
 * selection until Cloudflare's API is confirmed to support explicit
 * dimensions.
 */

function extractInlineImage(data: unknown): { base64: string } | null {
  if (!data || typeof data !== "object") return null;

  const asRecord = data as Record<string, unknown>;
  const result = "result" in asRecord ? asRecord["result"] : asRecord;

  if (result && typeof result === "object") {
    const maybeImage = (result as Record<string, unknown>)["image"];
    if (typeof maybeImage === "string" && maybeImage.length > 0) {
      return { base64: maybeImage };
    }
  }

  return null;
}

export function createCloudflareWorkersAiProvider(): AiProvider {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw new GenerationError("AI_NOT_CONFIGURED", "AI generation is not configured.");
  }

  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;

  return {
    name: "cloudflare-workers-ai",
    async generateTextToImage(
      providerModelId: string,
      request: TextToImageRequest,
    ): Promise<TextToImageResult> {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${providerModelId}`;

      const images: TextToImageResult["images"] = [];

      // flux-1-schnell generates one image per call — loop for
      // `imageCount` > 1 rather than assuming a `num_outputs`-style batch
      // parameter this model doesn't document.
      for (let i = 0; i < request.imageCount; i++) {
        let response: Response;
        try {
          response = await fetch(endpoint, {
            signal: AbortSignal.timeout(CLOUDFLARE_REQUEST_TIMEOUT_MS),
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiToken}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              prompt: request.prompt.slice(0, 2048), // documented model limit
              steps: 4,
              ...(request.seed !== undefined ? { seed: request.seed } : {}),
            }),
          });
        } catch (error) {
          console.error("Cloudflare Workers AI request failed:", error);
          throw new GenerationError("PROVIDER_ERROR", "The AI provider request failed.");
        }

        if (!response.ok) {
          const bodyText = await response.text().catch(() => "");
          console.error("Cloudflare Workers AI returned an error:", response.status, bodyText);

          if (/nsfw|flagged|safety|content policy|moderation/i.test(bodyText)) {
            throw new GenerationError(
              "PROVIDER_REJECTED",
              "This prompt was rejected by the AI provider's content safety system.",
            );
          }
          throw new GenerationError("PROVIDER_ERROR", "The AI provider request failed.");
        }

        const data: unknown = await response.json();
        const image = extractInlineImage(data);

        if (!image) {
          console.error("Cloudflare Workers AI response did not contain an image:", data);
          throw new GenerationError("PROVIDER_ERROR", "The AI provider returned no output.");
        }

        images.push({ kind: "inline", base64: image.base64 });
      }

      return { providerJobId: null, images };
    },

    async generateImageToImage(
      providerModelId: string,
      request: ImageToImageRequest,
    ): Promise<ImageToImageResult> {
      // Unified Inference endpoint: unlike the classic `@cf/...` REST
      // pattern used by generateTextToImage above (model in the URL
      // path), this one is a single fixed endpoint with the model named
      // inside the JSON body — see the file-level comment for why.
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`;

      const aspectRatio =
        request.aspectRatio && PRUNA_SUPPORTED_ASPECT_RATIOS.has(request.aspectRatio)
          ? request.aspectRatio
          : undefined;

      let response: Response;
      try {
        response = await fetch(endpoint, {
          signal: AbortSignal.timeout(CLOUDFLARE_REQUEST_TIMEOUT_MS),
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: providerModelId,
            input: {
              prompt: request.prompt.slice(0, 2000),
              // Data URI, confirmed against Cloudflare's own published
              // openai/gpt-image-2 example on this same Unified endpoint
              // — NOT the classic `@cf/...` models' raw byte-array or
              // `image_b64`-without-prefix formats.
              images: [
                `data:${request.inputMimeType || "image/png"};base64,${request.inputImageBuffer.toString("base64")}`,
              ],
              ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
            },
          }),
        });
      } catch (error) {
        console.error("Cloudflare Workers AI image-to-image request failed:", error);
        throw new GenerationError("PROVIDER_ERROR", "The AI provider request failed.");
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        console.error(
          "Cloudflare Workers AI image-to-image returned an error:",
          response.status,
          bodyText,
        );

        if (/nsfw|flagged|safety|content policy|moderation/i.test(bodyText)) {
          throw new GenerationError(
            "PROVIDER_REJECTED",
            "This prompt was rejected by the AI provider's content safety system.",
          );
        }
        throw new GenerationError("PROVIDER_ERROR", "The AI provider request failed.");
      }

      const data: unknown = await response.json().catch(() => null);

      // Every published Unified-endpoint example (p-image-edit, p-video,
      // recraft/recraftv4-1, flux-2-pro-preview) returns this same shape
      // synchronously: {state, result: {image: <url>}, gatewayMetadata}.
      // No polling implemented — none of the published examples showed a
      // non-"Completed" state for an image model, and p-image-edit is
      // specifically marketed as sub-second. If Cloudflare starts
      // returning "Processing"/"Queued" for this model in practice, this
      // is the place to add a poll loop against the same response shape.
      const state = isRecord(data) ? data["state"] : undefined;
      const result = isRecord(data) ? data["result"] : undefined;
      const imageUrl =
        isRecord(result) && typeof result["image"] === "string" ? result["image"] : null;

      if (state !== "Completed" || !imageUrl) {
        console.error(
          "Cloudflare Workers AI image-to-image did not return a completed image:",
          data,
        );
        throw new GenerationError("PROVIDER_ERROR", "The AI provider returned no output.");
      }

      return { providerJobId: null, images: [{ kind: "url", url: imageUrl }] };
    },

    /**
     * PHASE 10 MODEL VERIFICATION — `@cf/runwayml/stable-diffusion-v1-5-inpainting`,
     * a CLASSIC `@cf/...` endpoint model (same free tier as flux-1-schnell
     * above — confirmed live: `cf-ai-neurons: 0.00` on a real successful
     * call), NOT the Unified/partner catalog that blocked Phase 7's
     * image-to-image with a billing requirement. Also notably NOT
     * account-restricted the way `@cf/runwayml/stable-diffusion-v1-5-img2img`
     * was in Phase 7 (AiError 5018) — access apparently varies per model
     * even within the same vendor family on this account, so that
     * restriction doesn't generalize the way it first seemed to.
     *
     * Two real gotchas found only by live-testing (not by reading docs):
     *   - Cloudflare's OWN error message says `missing required input
     *     mask_image`, but the actual JSON field name is `mask`, not
     *     `mask_image` — confirmed against the model's own published
     *     input schema. The error message and the real field name
     *     disagree; trust the schema, not the error text.
     *   - `image` and `mask` are both raw byte arrays of an ENCODED PNG
     *     FILE (`Array.from(pngBuffer)`), the same convention already
     *     established for `image` on the img2img models in Phase 7 —
     *     NOT decoded pixel arrays, and NOT base64.
     *   - `prompt` is REQUIRED (schema: minLength 1) — unlike some other
     *     inpainting setups, this model will not do prompt-less context
     *     continuation.
     *
     * OUTPUT: confirmed live as raw PNG bytes directly in the HTTP body
     * (`content-type: image/png`), matching the classic-endpoint pattern,
     * not a JSON envelope — handled via the same content-type branch used
     * for the (ultimately unsuccessful) img2img attempts in Phase 7.
     *
     * NOT verified live in this environment: output dimensions when the
     * input `image`/`mask` are non-square, or the exact effect of
     * `strength`/`num_steps`/`guidance` on inpainting quality specifically
     * (only confirmed the call succeeds and returns a real PNG using a
     * small square test image) — canvas.server.ts's
     * `compositeOutpaintResult` defensively resizes the model's output to
     * the expected target dimensions regardless, so a wrong assumption
     * here degrades to an extra resize rather than a broken image.
     */
    async outpaintImage(
      providerModelId: string,
      request: OutpaintRequest,
    ): Promise<OutpaintResult> {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${providerModelId}`;

      let response: Response;
      try {
        response = await fetch(endpoint, {
          signal: AbortSignal.timeout(CLOUDFLARE_REQUEST_TIMEOUT_MS),
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            prompt: request.prompt.slice(0, 2048),
            image: Array.from(request.canvasBuffer),
            mask: Array.from(request.maskBuffer),
            num_steps: 20,
            guidance: 7.5,
            ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
            ...(request.seed !== undefined ? { seed: request.seed } : {}),
          }),
        });
      } catch (error) {
        console.error("Cloudflare Workers AI outpaint request failed:", error);
        throw new GenerationError("PROVIDER_ERROR", "The AI provider request failed.");
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        console.error(
          "Cloudflare Workers AI outpaint returned an error:",
          response.status,
          bodyText,
        );

        if (/nsfw|flagged|safety|content policy|moderation/i.test(bodyText)) {
          throw new GenerationError(
            "PROVIDER_REJECTED",
            "This prompt was rejected by the AI provider's content safety system.",
          );
        }
        throw new GenerationError("PROVIDER_ERROR", "The AI provider request failed.");
      }

      const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";

      if (contentType.startsWith("image/")) {
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength === 0) {
          throw new GenerationError("PROVIDER_ERROR", "The AI provider returned no output.");
        }
        return {
          providerJobId: null,
          images: [
            {
              kind: "inline",
              base64: Buffer.from(arrayBuffer).toString("base64"),
              mimeType: contentType,
            },
          ],
        };
      }

      const data: unknown = await response.json().catch(() => null);
      const image = extractInlineImage(data);
      if (!image) {
        console.error("Cloudflare Workers AI outpaint response did not contain an image:", data);
        throw new GenerationError("PROVIDER_ERROR", "The AI provider returned no output.");
      }

      return { providerJobId: null, images: [{ kind: "inline", base64: image.base64 }] };
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
