import { removeBackgroundLocally } from "../local/background-removal.server";
import { upscaleImageLocally, type UpscaleFactor } from "../local/upscale.server";
import { GenerationError } from "../errors.server";
import type {
  AiProvider,
  ImageToImageRequest,
  ImageToImageResult,
  RemoveBackgroundRequest,
  RemoveBackgroundResult,
  TextToImageRequest,
  TextToImageResult,
  UpscaleRequest,
  UpscaleResult,
} from "../types";

/**
 * The "local" provider — same-process, no-billing image processing (see
 * src/lib/ai/local/background-removal.server.ts and
 * src/lib/ai/local/upscale.server.ts for the actual work and each
 * model-choice verification). This provider implements
 * `removeBackground` and `upscaleImage`; the two generate* methods throw
 * a clear error rather than being silently unimplemented, in case an
 * `ai_models` row is ever misconfigured to point a text-to-image or
 * image-to-image model at `provider: "local"`.
 */
export function createLocalProcessor(): AiProvider {
  return {
    name: "local",

    async generateTextToImage(
      _providerModelId: string,
      _request: TextToImageRequest,
    ): Promise<TextToImageResult> {
      throw new GenerationError(
        "MODEL_NOT_AVAILABLE",
        "The local processor does not support text-to-image.",
      );
    },

    async generateImageToImage(
      _providerModelId: string,
      _request: ImageToImageRequest,
    ): Promise<ImageToImageResult> {
      throw new GenerationError(
        "MODEL_NOT_AVAILABLE",
        "The local processor does not support image-to-image.",
      );
    },

    async removeBackground(
      _providerModelId: string | null,
      request: RemoveBackgroundRequest,
    ): Promise<RemoveBackgroundResult> {
      const result = await removeBackgroundLocally(request.inputImageBuffer);
      return {
        providerJobId: null,
        images: [
          { kind: "inline", base64: result.buffer.toString("base64"), mimeType: result.mimeType },
        ],
      };
    },

    async upscaleImage(
      _providerModelId: string | null,
      request: UpscaleRequest,
    ): Promise<UpscaleResult> {
      const result = await upscaleImageLocally(
        request.inputImageBuffer,
        request.factor as UpscaleFactor,
      );
      return {
        providerJobId: null,
        images: [
          { kind: "inline", base64: result.buffer.toString("base64"), mimeType: result.mimeType },
        ],
        outputWidth: result.outputWidth,
        outputHeight: result.outputHeight,
        wasDownscaled: result.wasDownscaled,
      };
    },
  };
}
