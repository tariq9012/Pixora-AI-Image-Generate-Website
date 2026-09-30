import type * as ort from "onnxruntime-node";
import sharp from "sharp";

import { GenerationError } from "../errors.server";
import { loadOrt } from "./ort-loader.server";
import { ensureLocalModel, isLocalOnnxSupportedPlatform, withTimeout } from "./model-cache.server";

/**
 * PHASE 8 MODEL/METHOD VERIFICATION
 *
 * Audited before writing any code (per the phase 8 instructions — never
 * guess capability, never assume billing-free, never repeat Phase 7):
 *
 *   - Cloudflare Workers AI has NO native background-removal / matting
 *     model in either its classic `@cf/...` catalog or the newer Unified
 *     Inference (partner-model) catalog used in Phase 7. Every real-world
 *     "background removal on Cloudflare" writeup found during this audit
 *     either calls a paid third-party API or runs its own self-hosted
 *     ONNX model in a Cloudflare Container (Python), which is not "using
 *     Cloudflare's AI" in the sense Phase 6/7 did — it's the same
 *     self-hosted approach used here, just deployed differently.
 *   - `@imgly/background-removal-node` (the obvious npm candidate) is
 *     AGPL-3.0 and its last publish was 3+ years ago — a commercial SaaS
 *     can't use AGPL code without either open-sourcing under AGPL or
 *     buying IMG.LY's commercial license, and the package is effectively
 *     unmaintained. Rejected on both licensing and maintenance grounds.
 *   - `briaai/RMBG-1.4` / `RMBG-2.0` (the most commonly recommended
 *     Transformers.js background-removal model) is explicitly
 *     "source-available for non-commercial use — commercial use requires
 *     a paid agreement with BRIA." Same billing trap as Phase 7's
 *     pruna/p-image-edit, just paid to a different company. Rejected.
 *
 * **Chosen: `isnet-general-use.onnx`** — the IS-Net model from the DIS
 * project (xuebinqin/DIS), Apache-2.0 licensed, genuinely free for
 * commercial use with no gated/paid tier. Distributed (unmodified) via
 * the `rembg` project's GitHub Releases — rembg is itself Apache-2.0(*)
 * and MIT for the wrapper code, and this is the exact file its own
 * `DisSession` class uses, so the checksum and pre/post-processing below
 * are taken directly from rembg's source (rembg/sessions/dis.py and
 * session_base.py, both inspected during this phase), not guessed:
 *
 *   MODEL_URL: https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx
 *   MD5: fc16ebd8b0c10d971d3513d564d01e29  (rembg's own checksum for this file)
 *
 *   Preprocessing (BaseSession.normalize in rembg):
 *     1. Resize to 1024x1024 (direct stretch, not aspect-preserving —
 *        this matches the reference exactly; the output mask is resized
 *        back to the original image's real dimensions afterward)
 *     2. Divide every pixel by the image's own max byte value (not a
 *        fixed 255 — this is what rembg's normalize() literally does;
 *        for any real photo with a highlight this is equivalent to /255)
 *     3. Subtract per-channel mean (0.485, 0.456, 0.406) — ImageNet-style
 *        means, std is (1,1,1) so no division there
 *     4. HWC -> CHW, add batch dim -> float32[1,3,1024,1024]
 *
 *   Postprocessing (DisSession.predict in rembg):
 *     1. Take the first output tensor, channel 0 — NO sigmoid (this
 *        model's own final layer output is used directly, unlike some
 *        other rembg sessions which do apply one — confirmed by reading
 *        dis.py specifically, not assumed from a different model family)
 *     2. Per-image min-max normalize to [0,1]
 *     3. Scale to 0-255 as a single-channel mask, resize back to the
 *        source image's original dimensions (Lanczos)
 *
 * Both npm packages this file depends on are mainstream and permissively
 * licensed: `onnxruntime-node` (Microsoft, MIT, prebuilt binaries for
 * win32/darwin/linux x64 — no compilation needed) and `sharp` (Apache-2.0,
 * prebuilt binaries, the same library Next.js itself uses for image
 * processing).
 *
 * (*) DIS/IS-Net's own license: Apache-2.0. rembg's wrapper code: MIT.
 *
 * PRODUCTION CAVEAT (do not remove this without re-reading it): this
 * downloads a ~170MB file to local disk on first use and runs CPU-bound
 * ONNX inference in the request path. That is fine on a normal long-lived
 * Node server, a VPS, or a container with a persistent disk. It is NOT a
 * good fit for typical serverless/edge functions (Vercel serverless
 * functions, Cloudflare Workers, etc.) — those often have read-only or
 * ephemeral filesystems (the model would re-download on every cold
 * start), tight memory ceilings a 1024x1024 CPU inference can exceed, and
 * execution-time limits inference can blow through under load. Treat this
 * as "production-ready for a persistent Node process," not
 * "production-ready everywhere."
 */

const MODEL_SPEC = {
  url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
  filename: "isnet-general-use.onnx",
  md5: "fc16ebd8b0c10d971d3513d564d01e29",
  // Loose sanity bound, not a substitute for the MD5 check — just enough
  // to fail fast on an obviously truncated/corrupted partial download.
  minBytes: 100 * 1024 * 1024,
  maxBytes: 300 * 1024 * 1024,
};
const MODEL_INPUT_SIZE = 1024;
const NORMALIZE_MEAN = [0.485, 0.456, 0.406] as const;

const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000; // one-time cost, cached after
const INFERENCE_TIMEOUT_MS = 60 * 1000;

/** Module-level singleton so concurrent requests on a cold instance share
 * one download/load instead of racing to fetch 170MB multiple times. */
let sessionPromise: Promise<ort.InferenceSession> | null = null;

async function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = ensureLocalModel(MODEL_SPEC, DOWNLOAD_TIMEOUT_MS)
      .then(async (target) => (await loadOrt()).InferenceSession.create(target))
      .catch((error) => {
        // Don't cache a failed attempt — the next request should retry
        // (e.g. a transient network failure during download shouldn't
        // permanently disable the tool until the server restarts).
        sessionPromise = null;
        throw error;
      });
  }
  return sessionPromise;
}

/**
 * Cheap, synchronous pre-reservation check — see
 * isLocalOnnxSupportedPlatform's doc comment in model-cache.server.ts.
 * Re-exported under this tool-specific name so generation.server.ts's
 * import reads clearly at each call site.
 */
export const isBackgroundRemovalSupportedPlatform = isLocalOnnxSupportedPlatform;

export type LocalBackgroundRemovalOutput = {
  buffer: Buffer;
  mimeType: "image/png";
};

/**
 * Runs the full pipeline: preprocess -> ONNX inference -> min-max
 * normalize -> resize mask to source resolution -> composite as the
 * alpha channel of the original (full-resolution, unresized) image.
 *
 * Throws a `GenerationError` (never a raw error) so generation.server.ts
 * can map failures to the right refund behavior without needing to know
 * anything about ONNX/sharp internals.
 */
export async function removeBackgroundLocally(
  inputBuffer: Buffer,
): Promise<LocalBackgroundRemovalOutput> {
  if (!isBackgroundRemovalSupportedPlatform()) {
    throw new GenerationError(
      "PROCESSOR_UNAVAILABLE",
      "Background removal isn't supported on this server's platform.",
    );
  }

  let session: ort.InferenceSession;
  try {
    session = await getSession();
  } catch (error) {
    console.error("Failed to load the local background-removal model:", error);
    throw new GenerationError(
      "PROCESSOR_UNAVAILABLE",
      "The background removal engine could not be started. Please try again shortly.",
    );
  }

  try {
    return await withTimeout(
      runInference(session, inputBuffer),
      INFERENCE_TIMEOUT_MS,
      "Background removal",
    );
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    console.error("Local background removal failed:", error);
    throw new GenerationError("PROVIDER_ERROR", "Background removal failed. Please try again.");
  }
}

async function runInference(
  session: ort.InferenceSession,
  inputBuffer: Buffer,
): Promise<LocalBackgroundRemovalOutput> {
  const source = sharp(inputBuffer, { failOn: "none" }).rotate(); // rotate(): apply EXIF orientation before anything else

  // Width/height come from this raw extraction's own `info` (not a
  // separate .metadata() call) specifically because they must reflect
  // dimensions AFTER the .rotate() above is applied — a photo with a 90°
  // EXIF orientation has swapped width/height once rotated, and
  // .metadata() alone reports the file's pre-rotation dimensions. Using
  // mismatched dimensions here would corrupt every raw buffer below.
  const { data: originalRgb, info: originalInfo } = await source
    .clone()
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = originalInfo.width;
  const height = originalInfo.height;
  if (!width || !height) {
    throw new GenerationError("INVALID_OUTPUT", "Could not read the source image's dimensions.");
  }

  // --- Preprocess: resize to 1024x1024, RGB, no alpha ---
  const { data: resizedRgb, info: resizedInfo } = await source
    .clone()
    .resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, { fit: "fill", kernel: "lanczos3" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const expectedResizedBytes = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE * 3;
  if (resizedRgb.length !== expectedResizedBytes) {
    console.error(
      `Background removal: resized buffer size mismatch — got ${resizedRgb.length} bytes ` +
        `(${resizedInfo.width}x${resizedInfo.height}x${resizedInfo.channels}), expected ${expectedResizedBytes}.`,
    );
    throw new GenerationError("INVALID_OUTPUT", "Background removal failed to process the image.");
  }

  let maxByte = 0;
  for (let i = 0; i < resizedRgb.length; i++) {
    if (resizedRgb[i]! > maxByte) maxByte = resizedRgb[i]!;
  }
  if (maxByte === 0) maxByte = 255; // degenerate all-black input; avoid divide-by-zero

  const pixelCount = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const chw = new Float32Array(3 * pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const base = p * 3;
    chw[p] = resizedRgb[base]! / maxByte - NORMALIZE_MEAN[0];
    chw[pixelCount + p] = resizedRgb[base + 1]! / maxByte - NORMALIZE_MEAN[1];
    chw[2 * pixelCount + p] = resizedRgb[base + 2]! / maxByte - NORMALIZE_MEAN[2];
  }

  const inputName = session.inputNames[0];
  if (!inputName) {
    throw new GenerationError(
      "PROCESSOR_UNAVAILABLE",
      "The background removal model is misconfigured.",
    );
  }
  const { Tensor } = await loadOrt();
  const tensor = new Tensor("float32", chw, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);

  const results = await session.run({ [inputName]: tensor });
  const outputName = session.outputNames[0];
  if (!outputName || !results[outputName]) {
    throw new GenerationError("PROVIDER_ERROR", "The background removal model returned no output.");
  }
  const outputTensor = results[outputName]!;
  // Logged unconditionally (not just on error) because this is the one
  // thing about this model we could NOT verify by reading rembg's source
  // ahead of time — if there's ever a mismatched-output-shape bug, this
  // line is where to look first.
  console.log(
    `Background removal: output tensor "${outputName}" dims=[${outputTensor.dims.join(",")}] ` +
      `type=${outputTensor.type} length=${outputTensor.data.length}`,
  );
  const output = outputTensor.data as Float32Array;

  if (output.length !== pixelCount) {
    console.error(
      `Background removal: unexpected output length ${output.length}, expected ${pixelCount} ` +
        `(dims=[${outputTensor.dims.join(",")}]). Using only the first ${pixelCount} values.`,
    );
  }

  // --- Postprocess: min-max normalize -> 0-255 grayscale mask ---
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < output.length; i++) {
    const v = output[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1; // avoid divide-by-zero on a degenerate all-uniform output

  const maskSmall = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    maskSmall[i] = Math.max(0, Math.min(255, Math.round(((output[i]! - min) / range) * 255)));
  }

  // Resize the 1024x1024 mask back to the source image's real dimensions.
  // `.toColourspace("b-w")` is required here — without it, sharp silently
  // upconverts this single-channel raw pixel data to 3-channel sRGB
  // during resize (confirmed live: produced a buffer exactly 3x the
  // expected size), which corrupted every pixel's channel alignment in
  // the final composite below and produced a banded/torn-looking image.
  const maskFullSize = await sharp(Buffer.from(maskSmall), {
    raw: { width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE, channels: 1 },
  })
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .toColourspace("b-w")
    .raw()
    .toBuffer();

  const expectedMaskBytes = width * height;
  const expectedOriginalBytes = width * height * 3;
  if (maskFullSize.length !== expectedMaskBytes || originalRgb.length !== expectedOriginalBytes) {
    console.error(
      `Background removal: buffer size mismatch before compositing — ` +
        `mask=${maskFullSize.length} (expected ${expectedMaskBytes}), ` +
        `original=${originalRgb.length} (expected ${expectedOriginalBytes}), ` +
        `dims used: ${width}x${height}, originalInfo.channels=${originalInfo.channels}.`,
    );
    throw new GenerationError("INVALID_OUTPUT", "Background removal failed to process the image.");
  }

  // --- Composite: original (full-res) RGB + the resized mask as alpha ---
  const outputPng = await sharp(originalRgb, { raw: { width, height, channels: 3 } })
    .joinChannel(maskFullSize, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();

  // --- Validate real transparency exists (spec: don't claim success on
  // an accidentally-opaque or accidentally-fully-transparent output) ---
  const alphaStats = await sharp(outputPng).stats();
  const alphaChannel = alphaStats.channels[3];
  if (!alphaChannel || alphaChannel.min === alphaChannel.max) {
    throw new GenerationError(
      "INVALID_OUTPUT",
      "Background removal did not produce a usable transparent image. Please try a different photo.",
    );
  }

  return { buffer: outputPng, mimeType: "image/png" };
}
