import type * as ort from "onnxruntime-node";
import sharp from "sharp";

import { GenerationError } from "../errors.server";
import { loadOrt } from "./ort-loader.server";
import {
  ensureLocalModel,
  isLocalOnnxSupportedPlatform,
  withTimeout,
  type ModelSpec,
} from "./model-cache.server";

/**
 * PHASE 9 MODEL/METHOD VERIFICATION
 *
 * Same discipline as Phase 8: capability, license, and runtime fit
 * checked BEFORE writing any code, not assumed.
 *
 *   - Cloudflare Workers AI: no accessible, genuinely-free upscale /
 *     super-resolution model was found in the classic `@cf/...` catalog.
 *     Given Phase 7's outcome (the Unified/partner catalog on this
 *     account needs paid balance, which the account holder has declined
 *     to add), that route wasn't pursued further here — a local option
 *     was investigated first per this phase's own instructions, and one
 *     that's genuinely free was found, so Cloudflare was never needed.
 *   - Chosen: **Real-ESRGAN** (RRDBNet architecture, xinntao/Real-ESRGAN).
 *     The upstream project's own license is BSD-3-Clause — genuinely
 *     free for commercial use, no gated tier, unlike Phase 7/8's
 *     rejected candidates.
 *   - ONNX export used: `SceneWorks/real-esrgan-onnx` on Hugging Face
 *     (huggingface.co/SceneWorks/real-esrgan-onnx), itself BSD-3-Clause,
 *     "exported 1:1 from the canonical Real-ESRGAN weights... no weight
 *     changes... verified parity against the torch reference." Its own
 *     published spec (read directly from that model card, not guessed):
 *       - `real_esrgan_x2.onnx`: input `input` [1,3,h,w] f32 RGB [0,1],
 *         output `output` [1,3,2h,2w]
 *       - `real_esrgan_x4.onnx`: same shape convention, 4x output
 *       - Preprocessing is simple divide-by-255 (NO mean/std subtraction
 *         — confirmed against multiple independent real-world Real-ESRGAN
 *         ONNX inference examples, all of which agree on this point;
 *         this is notably simpler than Phase 8's IS-Net, which does
 *         subtract per-channel means)
 *       - Both files support dynamic height/width (no fixed input size
 *         requirement, unlike Phase 8's fixed 1024x1024)
 *       - Published SHA256 checksums (used for verification below):
 *         real_esrgan_x2.onnx: 7115ba92e8a1bfa63d68558ef006ef3d91273a068d321b1439f8bb1c9179002c
 *         real_esrgan_x4.onnx: 5c586662929cbc686c1a5c38d9c060dbdb4ea5863a1f7672b8c0761e6b89c033
 *
 * Billing: none. Same "local" provider/architecture as Phase 8 — runs on
 * this server's own CPU via onnxruntime-node, no remote API call at all.
 *
 * ONLY 2x AND 4x ARE OFFERED — there is no real, genuinely-free 8x
 * Real-ESRGAN weight; the UI does not offer 8x (see upscale.tsx). Running
 * the 4x model twice (chained) could theoretically approximate an 8x
 * result, but that's real added compute/complexity not implemented in
 * this phase — 8x stays off rather than being faked or silently
 * downgraded to 4x.
 *
 * FACE/DETAIL ENHANCEMENT TOGGLES ARE NOT REAL: this is the general
 * RRDBNet restoration network, not a pipeline with a separately
 * switchable face-restoration sub-model (that would be a different model
 * entirely, e.g. GFPGAN) — so those existing UI toggles are shown
 * disabled rather than wired to a no-op (see upscale.tsx).
 *
 * INPUT SIZE CAP, NOT TILING: Real-ESRGAN's compute/memory cost scales
 * with INPUT pixel count (the 23 RRDB blocks all run at input
 * resolution before the final upsampling layers), so a large source
 * photo run through this directly, with no tiling, could take a very
 * long time or exhaust memory on a CPU-only dev machine. The
 * SceneWorks export's own production pipeline tiles at 512px with
 * padding and stitches results — genuine tiling was judged too much
 * added complexity for this phase. Instead, MAX_INPUT_LONG_EDGE bounds
 * the image actually fed to the model: anything larger is downscaled
 * (Lanczos) to fit before upscaling, and this is disclosed back to the
 * caller (see `wasDownscaled` on the result) rather than done silently.
 *
 * ALPHA: the model is RGB-only (3 channels in, 3 out) — it has no
 * concept of transparency. A source PNG's alpha channel, if present, is
 * split off before inference, resized independently (Lanczos) to the
 * same output dimensions, and recombined afterward — the alpha channel
 * itself is never run through the super-resolution network, only
 * geometrically resized, which is the safe, honest option explicitly
 * suggested by this phase's own instructions.
 *
 * PRODUCTION CAVEAT (same shape as Phase 8's): fine for a persistent
 * Node server/VPS/container; not a good fit for serverless/edge given
 * the model download + CPU-bound inference in the request path.
 */

const MODEL_SPECS: Record<UpscaleFactor, ModelSpec> = {
  2: {
    url: "https://huggingface.co/SceneWorks/real-esrgan-onnx/resolve/main/real_esrgan_x2.onnx",
    filename: "real_esrgan_x2.onnx",
    md5: "", // verified via SHA256 instead — see verifySha256 below
    minBytes: 40 * 1024 * 1024,
    maxBytes: 120 * 1024 * 1024,
  },
  4: {
    url: "https://huggingface.co/SceneWorks/real-esrgan-onnx/resolve/main/real_esrgan_x4.onnx",
    filename: "real_esrgan_x4.onnx",
    md5: "",
    minBytes: 40 * 1024 * 1024,
    maxBytes: 120 * 1024 * 1024,
  },
};

const SHA256_BY_FACTOR: Record<UpscaleFactor, string> = {
  2: "7115ba92e8a1bfa63d68558ef006ef3d91273a068d321b1439f8bb1c9179002c",
  4: "5c586662929cbc686c1a5c38d9c060dbdb4ea5863a1f7672b8c0761e6b89c033",
};

export type UpscaleFactor = 2 | 4;

// Bounds the image actually fed to the model — see the file-level "INPUT
// SIZE CAP" comment above for why. Larger sources are downscaled first.
const MAX_INPUT_LONG_EDGE = 1024;

const DOWNLOAD_TIMEOUT_MS = 20 * 60 * 1000;
// Deliberately generous — a 23-block RRDBNet run on CPU with no GPU
// acceleration can be slow, especially at the 4x model / larger inputs.
// Not measured against real hardware in this environment (see the final
// report) — treat as a starting point, not a validated number.
const INFERENCE_TIMEOUT_MS = 5 * 60 * 1000;

const sessionPromises: Partial<Record<UpscaleFactor, Promise<ort.InferenceSession>>> = {};

async function getSession(factor: UpscaleFactor): Promise<ort.InferenceSession> {
  const existing = sessionPromises[factor];
  if (existing) return existing;

  const spec = MODEL_SPECS[factor];
  const promise = ensureLocalModel(spec, DOWNLOAD_TIMEOUT_MS)
    .then(async (target) => {
      await verifySha256(target, SHA256_BY_FACTOR[factor]);
      return (await loadOrt()).InferenceSession.create(target);
    })
    .catch((error) => {
      delete sessionPromises[factor];
      throw error;
    });

  sessionPromises[factor] = promise;
  return promise;
}

/**
 * `ModelSpec.md5` is left empty for these two files above because the
 * checksum published for them is SHA256, not MD5 (unlike Phase 8's
 * model) — `ensureLocalModel`'s own integrity check is skipped for an
 * empty md5, so this does the real verification instead, once per
 * session (not on every request), against the exact SHA256 published on
 * the model's Hugging Face card.
 */
async function verifySha256(filePath: string, expected: string): Promise<void> {
  const { createHash } = await import("node:crypto");
  const { createReadStream } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  const actual = hash.digest("hex");
  if (actual !== expected) {
    throw new Error(`Upscale model checksum mismatch: expected ${expected}, got ${actual}.`);
  }
}

export const isUpscaleSupportedPlatform = isLocalOnnxSupportedPlatform;

export type LocalUpscaleOutput = {
  buffer: Buffer;
  mimeType: "image/png";
  outputWidth: number;
  outputHeight: number;
  /** True if the source exceeded MAX_INPUT_LONG_EDGE and was downscaled
   * before upscaling — surfaced so the caller can be honest about it
   * rather than silently changing what "4x" means for a large photo. */
  wasDownscaled: boolean;
};

export async function upscaleImageLocally(
  inputBuffer: Buffer,
  factor: UpscaleFactor,
): Promise<LocalUpscaleOutput> {
  if (!isUpscaleSupportedPlatform()) {
    throw new GenerationError(
      "PROCESSOR_UNAVAILABLE",
      "Upscaling isn't supported on this server's platform.",
    );
  }

  let session: ort.InferenceSession;
  try {
    session = await getSession(factor);
  } catch (error) {
    console.error("Failed to load the local upscale model:", error);
    throw new GenerationError(
      "PROCESSOR_UNAVAILABLE",
      "The upscaling engine could not be started. Please try again shortly.",
    );
  }

  try {
    return await withTimeout(
      runInference(session, inputBuffer, factor),
      INFERENCE_TIMEOUT_MS,
      "Upscaling",
    );
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    console.error("Local upscaling failed:", error);
    throw new GenerationError("PROVIDER_ERROR", "Upscaling failed. Please try again.");
  }
}

async function runInference(
  session: ort.InferenceSession,
  inputBuffer: Buffer,
  factor: UpscaleFactor,
): Promise<LocalUpscaleOutput> {
  const probe = sharp(inputBuffer, { failOn: "none" }).rotate();
  const probeMeta = await probe.clone().metadata();
  if (!probeMeta.width || !probeMeta.height) {
    throw new GenerationError("INVALID_OUTPUT", "Could not read the source image's dimensions.");
  }
  // sharp's own `.metadata()` does NOT reflect `.rotate()`'s effect on
  // width/height — this is a documented, long-standing sharp behavior
  // (confirmed against multiple upstream issue reports), not a guess.
  // EXIF orientation 5-8 mean a 90°/270° rotation, which swaps the
  // effective width/height once `.rotate()` actually applies it; without
  // this correction, a portrait phone photo shot in landscape orientation
  // would compute the wrong `workWidth`/`workHeight` below and reproduce
  // the exact dimension-mismatch corruption Phase 8 hit before its fix.
  const orientation = probeMeta.orientation ?? 1;
  const trueWidth = orientation >= 5 ? probeMeta.height : probeMeta.width;
  const trueHeight = orientation >= 5 ? probeMeta.width : probeMeta.height;

  const longEdge = Math.max(trueWidth, trueHeight);
  const wasDownscaled = longEdge > MAX_INPUT_LONG_EDGE;
  const scaleDown = wasDownscaled ? MAX_INPUT_LONG_EDGE / longEdge : 1;
  const workWidth = Math.max(1, Math.round(trueWidth * scaleDown));
  const workHeight = Math.max(1, Math.round(trueHeight * scaleDown));

  const hasAlpha = probeMeta.hasAlpha ?? false;

  // --- Preprocess: RGB, at (possibly downscaled) working size, /255 ---
  const rgbPipeline = probe.clone().removeAlpha().toColourspace("srgb");
  // Always resize explicitly to the computed working dimensions — even
  // when `wasDownscaled` is false this is a no-op in practice (same
  // dimensions in as out) but guarantees `rgbInfo` below matches
  // `workWidth`/`workHeight` exactly, rather than trusting two
  // independently-derived numbers to agree.
  rgbPipeline.resize(workWidth, workHeight, { fit: "fill", kernel: "lanczos3" });
  const { data: rgbRaw, info: rgbInfo } = await rgbPipeline
    .raw()
    .toBuffer({ resolveWithObject: true });

  const expectedRgbBytes = workWidth * workHeight * 3;
  if (rgbRaw.length !== expectedRgbBytes || rgbInfo.channels !== 3) {
    console.error(
      `Upscale: RGB buffer size mismatch — got ${rgbRaw.length} bytes (${rgbInfo.width}x${rgbInfo.height}x${rgbInfo.channels}), expected ${expectedRgbBytes}.`,
    );
    throw new GenerationError("INVALID_OUTPUT", "Upscaling failed to process the image.");
  }

  const pixelCount = workWidth * workHeight;
  const chw = new Float32Array(3 * pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const base = p * 3;
    chw[p] = rgbRaw[base]! / 255;
    chw[pixelCount + p] = rgbRaw[base + 1]! / 255;
    chw[2 * pixelCount + p] = rgbRaw[base + 2]! / 255;
  }

  const inputName = session.inputNames[0];
  if (!inputName) {
    throw new GenerationError("PROCESSOR_UNAVAILABLE", "The upscale model is misconfigured.");
  }
  const { Tensor } = await loadOrt();
  const tensor = new Tensor("float32", chw, [1, 3, workHeight, workWidth]);

  const results = await session.run({ [inputName]: tensor });
  const outputName = session.outputNames[0];
  if (!outputName || !results[outputName]) {
    throw new GenerationError("PROVIDER_ERROR", "The upscale model returned no output.");
  }
  const outputTensor = results[outputName]!;
  console.log(
    `Upscale: output tensor "${outputName}" dims=[${outputTensor.dims.join(",")}] ` +
      `type=${outputTensor.type} length=${outputTensor.data.length}`,
  );

  const dims = outputTensor.dims;
  const outHeight = dims[2];
  const outWidth = dims[3];
  if (!outHeight || !outWidth) {
    throw new GenerationError(
      "PROVIDER_ERROR",
      "The upscale model returned an unexpected output shape.",
    );
  }
  const outPixelCount = outHeight * outWidth;
  const outData = outputTensor.data as Float32Array;

  if (outData.length !== outPixelCount * 3) {
    console.error(
      `Upscale: unexpected output length ${outData.length}, expected ${outPixelCount * 3} ` +
        `(dims=[${dims.join(",")}]).`,
    );
    throw new GenerationError(
      "PROVIDER_ERROR",
      "The upscale model returned an unexpected output shape.",
    );
  }

  // --- Postprocess: CHW float [0,1] (clamped) -> HWC uint8 ---
  const outRgb = new Uint8Array(outPixelCount * 3);
  for (let p = 0; p < outPixelCount; p++) {
    const r = outData[p]!;
    const g = outData[outPixelCount + p]!;
    const b = outData[2 * outPixelCount + p]!;
    outRgb[p * 3] = Math.round(Math.max(0, Math.min(1, r)) * 255);
    outRgb[p * 3 + 1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
    outRgb[p * 3 + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
  }

  let outputPipeline = sharp(Buffer.from(outRgb), {
    raw: { width: outWidth, height: outHeight, channels: 3 },
  });

  if (hasAlpha) {
    // Alpha is never run through the network — only geometrically
    // resized to match the model's real output dimensions. `.toColourspace("b-w")`
    // is required here for the same reason Phase 8 needed it: without
    // it sharp silently upconverts this single-channel raw data to
    // 3-channel sRGB during resize, corrupting the later composite.
    const alphaOut = await probe
      .clone()
      .extractChannel("alpha")
      .resize(outWidth, outHeight, { fit: "fill", kernel: "lanczos3" })
      .toColourspace("b-w")
      .raw()
      .toBuffer();

    if (alphaOut.length !== outPixelCount) {
      console.error(
        `Upscale: alpha buffer size mismatch — got ${alphaOut.length}, expected ${outPixelCount}.`,
      );
      throw new GenerationError("INVALID_OUTPUT", "Upscaling failed to process transparency.");
    }

    outputPipeline = outputPipeline.joinChannel(alphaOut, {
      raw: { width: outWidth, height: outHeight, channels: 1 },
    });
  }

  const outputBuffer = await outputPipeline.png().toBuffer();

  if (outWidth <= workWidth || outHeight <= workHeight) {
    // Sanity check from item 33: a "successful" upscale that isn't
    // actually larger than what went into the model is not a success.
    throw new GenerationError("INVALID_OUTPUT", "Upscaling did not produce a larger image.");
  }

  return {
    buffer: outputBuffer,
    mimeType: "image/png",
    outputWidth: outWidth,
    outputHeight: outHeight,
    wasDownscaled,
  };
}
