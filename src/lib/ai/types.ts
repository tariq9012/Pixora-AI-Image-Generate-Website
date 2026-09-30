/**
 * "local" is Phase 8's addition: not a remote API at all, but a
 * same-process, no-billing image processor (see
 * src/lib/ai/providers/local.server.ts and
 * src/lib/ai/local/background-removal.server.ts). It's still modeled as
 * an AiProvider so generation.server.ts's `getAiProvider(model.provider)`
 * lookup works identically regardless of whether a model is backed by a
 * remote API or local compute.
 */
export type AiProviderName = "replicate" | "cloudflare-workers-ai" | "local";

export type TextToImageRequest = {
  prompt: string;
  negativePrompt?: string | undefined;
  /** Already validated against the model's supported set before this is built. */
  aspectRatio: string;
  imageCount: number;
  seed?: number | undefined;
};

/**
 * Providers differ in how they hand back generated images: some (Replicate)
 * host the result at a temporary URL the caller downloads separately;
 * others (Cloudflare Workers AI) return the image bytes directly in the
 * same response. Both are first-class here so generation.server.ts
 * doesn't need to know which provider produced a given result.
 */
export type TextToImageOutputImage =
  { kind: "url"; url: string } | { kind: "inline"; base64: string; mimeType?: string };

export type TextToImageResult = {
  providerJobId: string | null;
  images: TextToImageOutputImage[];
};

/**
 * Phase 7: image-to-image. The source image is always handed to the
 * provider as raw bytes the server itself already loaded (via the
 * storage abstraction) — never a URL the provider has to fetch, and
 * never a client-supplied path. `strength` is the provider-facing value
 * (0..1, "how strongly to apply the transformation" — lower keeps the
 * result closer to the input), already converted from whatever scale the
 * UI presents; see generation.server.ts for that mapping.
 */
export type ImageToImageRequest = {
  prompt: string;
  negativePrompt?: string | undefined;
  inputImageBuffer: Buffer;
  inputMimeType: string;
  strength?: number | undefined;
  seed?: number | undefined;
  /**
   * e.g. "1:1", "16:9" — only used by providers/models that document
   * support for it (currently pruna/p-image-edit on Cloudflare; ignored
   * by anything else). Not every provider honors every field here —
   * each provider implementation only reads what its chosen model
   * actually documents.
   */
  aspectRatio?: string | undefined;
};

export type ImageToImageResult = {
  providerJobId: string | null;
  images: TextToImageOutputImage[];
};

/**
 * Phase 8: background removal. `inputImageBuffer` is already-loaded raw
 * bytes from the storage abstraction — same "never hand the provider a
 * URL/path, always the real bytes" rule as ImageToImageRequest above.
 * There's no prompt: this operation is Upload → Remove Background, not a
 * text-driven tool (see remove-background.tsx).
 */
export type RemoveBackgroundRequest = {
  inputImageBuffer: Buffer;
  inputMimeType: string;
};

export type RemoveBackgroundResult = {
  providerJobId: string | null;
  images: TextToImageOutputImage[];
};

/**
 * Phase 9: upscaling. Same "always real bytes, never a path/URL" rule.
 * `factor` is validated server-side against the set the local Real-ESRGAN
 * processor actually ships weights for (2 and 4 — see
 * local/upscale.server.ts) before this type is ever constructed.
 */
export type UpscaleRequest = {
  inputImageBuffer: Buffer;
  inputMimeType: string;
  factor: 2 | 4;
};

export type UpscaleResult = {
  providerJobId: string | null;
  images: TextToImageOutputImage[];
  outputWidth: number;
  outputHeight: number;
  wasDownscaled: boolean;
};

/**
 * Phase 10: outpainting/expand. `canvasBuffer`/`maskBuffer` are already
 * fully constructed (target-sized canvas with the original image placed
 * at its offset, and a matching black=preserve/white=generate mask with
 * feathered edges) — see canvas.server.ts for that construction.
 * `prompt` is REQUIRED here, unlike every other tool's optional/absent
 * prompt — confirmed against Cloudflare's own published schema for
 * `@cf/runwayml/stable-diffusion-v1-5-inpainting`
 * ("prompt string required minLength 1"), not assumed.
 */
export type OutpaintRequest = {
  canvasBuffer: Buffer;
  maskBuffer: Buffer;
  prompt: string;
  negativePrompt?: string | undefined;
  seed?: number | undefined;
};

export type OutpaintResult = {
  providerJobId: string | null;
  images: TextToImageOutputImage[];
};

/**
 * Every real provider/processor implements this. Nothing outside
 * src/lib/ai should import a provider SDK (or, for "local", an ONNX
 * runtime) directly.
 *
 * `removeBackground`/`upscaleImage`/`outpaintImage` are optional on the
 * interface — unlike generateTextToImage/generateImageToImage, which
 * every provider so far has implemented (even if only to throw a clear
 * "not supported" error, see replicate.server.ts's generateImageToImage)
 * — because forcing every provider to carry a stub for a capability only
 * one of them actually has would be pure noise. generation.server.ts
 * checks for presence before calling any of them.
 */
export interface AiProvider {
  readonly name: AiProviderName;
  generateTextToImage(
    providerModelId: string,
    request: TextToImageRequest,
  ): Promise<TextToImageResult>;
  generateImageToImage(
    providerModelId: string,
    request: ImageToImageRequest,
  ): Promise<ImageToImageResult>;
  removeBackground?(
    providerModelId: string | null,
    request: RemoveBackgroundRequest,
  ): Promise<RemoveBackgroundResult>;
  upscaleImage?(providerModelId: string | null, request: UpscaleRequest): Promise<UpscaleResult>;
  outpaintImage?(providerModelId: string, request: OutpaintRequest): Promise<OutpaintResult>;
}
