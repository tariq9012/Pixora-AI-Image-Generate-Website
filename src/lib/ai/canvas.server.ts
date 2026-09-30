import sharp from "sharp";

import { GenerationError } from "./errors.server";

/**
 * PHASE 10 CANVAS/MASK CONSTRUCTION
 *
 * Builds the two images `@cf/runwayml/stable-diffusion-v1-5-inpainting`
 * needs for outpainting: an expanded canvas (the original image placed at
 * an offset, with new blank space around it) and a matching mask (black
 * = preserve, white = generate — the standard RunwayML/diffusers
 * Stable-Diffusion-Inpainting convention, confirmed against this exact
 * model's own vendor family).
 *
 * Deliberately built entirely through sharp's own high-level pipeline
 * operations (`.extend()`, `.composite()`, `.resize(..., {fit:"fill"})`)
 * rather than manual raw-buffer/typed-array math — Phase 8 and 9 both hit
 * real, live bugs from hand-rolled raw-buffer channel/stride handling
 * (an unintended 3-channel upconversion during a raw resize, and
 * `.metadata()` not reflecting `.rotate()`'s effect on width/height for
 * EXIF-rotated photos). Staying inside sharp's own type-safe operations
 * for both the canvas and the mask avoids that whole bug class here.
 *
 * MAX_CANVAS_LONG_EDGE bounds the working resolution actually sent to
 * Cloudflare, for two independent reasons: (1) Cloudflare's own
 * documented limit for this model family is 2048px per side, and (2)
 * more importantly, SD1.5 (which this model is built on) was trained at
 * 512x512 and is well known to degrade in coherence well before 2048 —
 * so this cap is set for quality, not just to satisfy the vendor limit.
 * If the requested expansion would exceed it, the WHOLE working
 * resolution (original placement + expansion) is scaled down
 * proportionally before generation — never silently cropped or rejected
 * — and this is reported back via `wasDownscaled` so the caller can be
 * honest about it, the same pattern Phase 9 established for its own
 * input-size cap.
 */
const MAX_CANVAS_LONG_EDGE = 1024;
// Gaussian blur sigma applied to the mask boundary so the generated
// region blends into the preserved original rather than showing a hard
// seam. Purely empirical — not measured against real output in this
// environment (see the final report) — treat as a starting point.
const FEATHER_SIGMA = 20;

export type OutpaintDirections = {
  /** 0-100, percentage of the ORIGINAL (pre-expansion) dimension on that
   * side — matches the existing expand.tsx slider scale exactly. */
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type BuiltOutpaintCanvas = {
  /** RGB PNG — the original image placed at its offset, surrounded by
   * blank (black) space in the newly-expanded regions. */
  canvasBuffer: Buffer;
  /** Grayscale PNG, feathered — black over the placed original, white
   * over the expanded regions, per the SD-Inpainting mask convention. */
  maskBuffer: Buffer;
  targetWidth: number;
  targetHeight: number;
  wasDownscaled: boolean;
};

export async function buildOutpaintCanvas(
  sourceBuffer: Buffer,
  directions: OutpaintDirections,
): Promise<BuiltOutpaintCanvas> {
  const meta = await sharp(sourceBuffer, { failOn: "none" }).metadata();
  if (!meta.width || !meta.height) {
    throw new GenerationError("INVALID_OUTPUT", "Could not read the source image's dimensions.");
  }
  // `.metadata()` does NOT reflect `.rotate()`'s effect on width/height
  // (a documented sharp behavior, hit and fixed in Phase 9) — orientation
  // 5-8 means a 90°/270° rotation, which swaps the effective dimensions.
  const orientation = meta.orientation ?? 1;
  const trueWidth = orientation >= 5 ? meta.height : meta.width;
  const trueHeight = orientation >= 5 ? meta.width : meta.height;

  const leftPxRaw = Math.round((trueWidth * directions.left) / 100);
  const rightPxRaw = Math.round((trueWidth * directions.right) / 100);
  const topPxRaw = Math.round((trueHeight * directions.top) / 100);
  const bottomPxRaw = Math.round((trueHeight * directions.bottom) / 100);

  const targetWidthRaw = trueWidth + leftPxRaw + rightPxRaw;
  const targetHeightRaw = trueHeight + topPxRaw + bottomPxRaw;
  const longEdgeRaw = Math.max(targetWidthRaw, targetHeightRaw);

  const wasDownscaled = longEdgeRaw > MAX_CANVAS_LONG_EDGE;
  const scale = wasDownscaled ? MAX_CANVAS_LONG_EDGE / longEdgeRaw : 1;

  // Every dimension is scaled by the same factor, so they stay
  // proportionally self-consistent — the working image is resized to
  // EXACTLY (workingWidth, workingHeight) below via `fit:"fill"`, which
  // forces sharp to output precisely those dimensions, so there is no
  // possibility of the canvas and these numbers disagreeing.
  const workingWidth = Math.max(1, Math.round(trueWidth * scale));
  const workingHeight = Math.max(1, Math.round(trueHeight * scale));
  const leftPx = Math.max(0, Math.round(leftPxRaw * scale));
  const rightPx = Math.max(0, Math.round(rightPxRaw * scale));
  const topPx = Math.max(0, Math.round(topPxRaw * scale));
  const bottomPx = Math.max(0, Math.round(bottomPxRaw * scale));
  const targetWidth = workingWidth + leftPx + rightPx;
  const targetHeight = workingHeight + topPx + bottomPx;

  if (leftPx + rightPx + topPx + bottomPx === 0) {
    throw new GenerationError("INVALID_GENERATION_OPTIONS", "Choose at least one side to expand.");
  }

  const canvasBuffer = await sharp(sourceBuffer, { failOn: "none" })
    .rotate()
    .resize(workingWidth, workingHeight, { fit: "fill", kernel: "lanczos3" })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .extend({
      left: leftPx,
      right: rightPx,
      top: topPx,
      bottom: bottomPx,
      background: { r: 0, g: 0, b: 0 },
    })
    .png()
    .toBuffer();

  const preservedRect = await sharp({
    create: {
      width: workingWidth,
      height: workingHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();

  const maskBuffer = await sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: preservedRect, left: leftPx, top: topPx }])
    .blur(FEATHER_SIGMA)
    .toColourspace("b-w")
    .png()
    .toBuffer();

  return { canvasBuffer, maskBuffer, targetWidth, targetHeight, wasDownscaled };
}

/**
 * Guarantees the preserved (original) region is pixel-perfect rather than
 * trusting the diffusion model to leave it untouched — a real inpainting
 * model can still subtly alter "preserved" pixels, especially near the
 * mask boundary. This takes the model's full generated canvas and pastes
 * `canvasBuffer` (the original-placed-on-black image already sent to the
 * model — reused here rather than rebuilt) back on top, using the
 * INVERTED feathered mask as an alpha channel: fully opaque over the
 * original, fading to fully transparent by the time it reaches the
 * generated region, so the model's new content shows through smoothly
 * with no hard seam.
 */
// --- Phase 11: Editor / masked inpainting ---
//
// Deliberately reuses the SAME model call as Phase 10 (see
// generateEditorEdit in generation.server.ts, which calls
// provider.outpaintImage() — the Cloudflare inpainting endpoint doesn't
// care whether the mask/canvas came from an outpaint expansion or an
// in-place edit selection; both are just "image + mask + prompt" to it).
// Only the CANVAS/MASK CONSTRUCTION differs from outpainting:
//   - Outpaint: canvas is LARGER than the source (original placed at an
//     offset inside new blank space); mask marks the new space.
//   - Editor: canvas is the SAME SIZE as the (normalized) source; mask
//     marks user-painted regions inside the existing image.
// compositeOutpaintResult() below is reused as-is for both — its logic
// (paste the pre-model canvas back over the model's output using the
// inverted feathered mask as alpha) has nothing outpaint-specific in it.

/** Same reasoning as MAX_CANVAS_LONG_EDGE above (Cloudflare's documented
 * per-side limit + SD1.5's real quality ceiling) — kept as a separate
 * constant rather than reusing MAX_CANVAS_LONG_EDGE directly so the two
 * tools' working-resolution caps can be tuned independently later. */
const MAX_EDITOR_LONG_EDGE = 1024;

/** A mask covering more of the image than this is rejected rather than
 * silently treated as a full edit — see Phase 11 spec §19: without this
 * cap, a "select everything" mask would make the Editor functionally
 * equivalent to Phase 7's Image-to-Image, which stays deliberately
 * disabled. Measured on the RAW (pre-feather) resized mask so an
 * intentionally large-but-not-total selection isn't penalized for the
 * feather blur's own soft falloff at the edges. */
const MAX_EDIT_MASK_COVERAGE_PERCENT = 95;

export type BuiltEditorCanvas = {
  /** RGB PNG — the normalized (EXIF-corrected, possibly downscaled)
   * source image, unchanged in content. */
  canvasBuffer: Buffer;
  /** Grayscale PNG, feathered — black = preserve, white = generate, same
   * convention as buildOutpaintCanvas. */
  maskBuffer: Buffer;
  targetWidth: number;
  targetHeight: number;
  wasDownscaled: boolean;
  /** 0-100, coverage of the raw (pre-feather) mask — surfaced so the
   * caller can log/report it in generation metadata (Phase 11 spec §48). */
  maskCoveragePercent: number;
};

/**
 * Validates the client-painted mask against the source image and builds
 * the exact (canvas, mask) pair `provider.outpaintImage()` expects.
 *
 * `rawMaskBuffer` must already be a valid PNG at EXACTLY the source
 * image's own EXIF-corrected pixel dimensions — the browser is
 * responsible for painting onto a canvas sized to the image's natural
 * (post-orientation) dimensions (see editor.tsx), so this function
 * REJECTS a mismatched mask rather than silently stretching it (spec
 * §7/§11) — the only resizing this does is the same proportional
 * long-edge downscale applied identically to both canvas and mask when
 * the source exceeds MAX_EDITOR_LONG_EDGE, exactly mirroring
 * buildOutpaintCanvas's own documented downscale step.
 */
export async function buildEditorCanvas(
  sourceBuffer: Buffer,
  rawMaskBuffer: Buffer,
): Promise<BuiltEditorCanvas> {
  const meta = await sharp(sourceBuffer, { failOn: "none" }).metadata();
  if (!meta.width || !meta.height) {
    throw new GenerationError("INVALID_OUTPUT", "Could not read the source image's dimensions.");
  }
  // Same EXIF-orientation lesson as buildOutpaintCanvas above (and
  // Phase 9 before it): `.metadata()`'s width/height do NOT reflect
  // `.rotate()`'s effect for orientation 5-8.
  const orientation = meta.orientation ?? 1;
  const trueWidth = orientation >= 5 ? meta.height : meta.width;
  const trueHeight = orientation >= 5 ? meta.width : meta.height;

  const maskMeta = await sharp(rawMaskBuffer, { failOn: "error" })
    .metadata()
    .catch((error: unknown) => {
      console.error("Editor: failed to decode submitted mask:", error);
      return null;
    });
  if (!maskMeta || !maskMeta.width || !maskMeta.height) {
    throw new GenerationError("INVALID_MASK", "The mask image could not be read.");
  }
  if (maskMeta.width !== trueWidth || maskMeta.height !== trueHeight) {
    throw new GenerationError(
      "INVALID_MASK",
      "The mask doesn't match the source image's dimensions. Please try again.",
    );
  }

  // Raw single-channel (grayscale) pixels of the mask EXACTLY as
  // submitted — used only to measure coverage before any feathering
  // blurs the boundary intensities.
  const rawMaskGray = await sharp(rawMaskBuffer, { failOn: "error" })
    .toColourspace("b-w")
    .raw()
    .toBuffer();
  let whitePixels = 0;
  const WHITE_THRESHOLD = 127;
  for (let i = 0; i < rawMaskGray.length; i++) {
    if ((rawMaskGray[i] ?? 0) > WHITE_THRESHOLD) whitePixels++;
  }
  const totalPixels = trueWidth * trueHeight;
  const maskCoveragePercent = totalPixels > 0 ? (whitePixels / totalPixels) * 100 : 0;

  if (whitePixels === 0) {
    throw new GenerationError("EMPTY_EDIT_MASK", "Paint the area you want to change first.");
  }
  if (maskCoveragePercent > MAX_EDIT_MASK_COVERAGE_PERCENT) {
    throw new GenerationError(
      "INVALID_MASK",
      "That selection covers nearly the whole image. Select a smaller area, or use a dedicated Image-to-Image tool once available.",
    );
  }

  const longEdge = Math.max(trueWidth, trueHeight);
  const wasDownscaled = longEdge > MAX_EDITOR_LONG_EDGE;
  const scale = wasDownscaled ? MAX_EDITOR_LONG_EDGE / longEdge : 1;
  const targetWidth = Math.max(1, Math.round(trueWidth * scale));
  const targetHeight = Math.max(1, Math.round(trueHeight * scale));

  const canvasBuffer = await sharp(sourceBuffer, { failOn: "none" })
    .rotate()
    .resize(targetWidth, targetHeight, { fit: "fill", kernel: "lanczos3" })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .png()
    .toBuffer();

  const maskBuffer = await sharp(rawMaskBuffer, { failOn: "error" })
    .resize(targetWidth, targetHeight, { fit: "fill", kernel: "lanczos3" })
    .blur(FEATHER_SIGMA)
    .toColourspace("b-w")
    .png()
    .toBuffer();

  return {
    canvasBuffer,
    maskBuffer,
    targetWidth,
    targetHeight,
    wasDownscaled,
    maskCoveragePercent,
  };
}

export async function compositeOutpaintResult(
  modelOutputBuffer: Buffer,
  canvasBuffer: Buffer,
  maskBuffer: Buffer,
  targetWidth: number,
  targetHeight: number,
): Promise<Buffer> {
  const invertedMaskRaw = await sharp(maskBuffer).negate().toColourspace("b-w").raw().toBuffer();
  const expectedMaskBytes = targetWidth * targetHeight;
  if (invertedMaskRaw.length !== expectedMaskBytes) {
    console.error(
      `Outpaint: inverted mask buffer size mismatch — got ${invertedMaskRaw.length}, expected ${expectedMaskBytes}.`,
    );
    throw new GenerationError("INVALID_OUTPUT", "Outpainting failed to process the image.");
  }

  const canvasRgbRaw = await sharp(canvasBuffer)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer();
  const expectedCanvasBytes = targetWidth * targetHeight * 3;
  if (canvasRgbRaw.length !== expectedCanvasBytes) {
    console.error(
      `Outpaint: canvas buffer size mismatch — got ${canvasRgbRaw.length}, expected ${expectedCanvasBytes}.`,
    );
    throw new GenerationError("INVALID_OUTPUT", "Outpainting failed to process the image.");
  }

  const overlayRgba = await sharp(canvasRgbRaw, {
    raw: { width: targetWidth, height: targetHeight, channels: 3 },
  })
    .joinChannel(invertedMaskRaw, {
      raw: { width: targetWidth, height: targetHeight, channels: 1 },
    })
    .png()
    .toBuffer();

  return (
    sharp(modelOutputBuffer)
      // Defensive: force exact target dimensions even if the model
      // returned something slightly different than requested — this has
      // NOT been verified against a live non-square test in this
      // environment (see the final report), so this resize is the safety
      // net if that assumption ever turns out wrong.
      .resize(targetWidth, targetHeight, { fit: "fill", kernel: "lanczos3" })
      .composite([{ input: overlayRgba, left: 0, top: 0 }])
      .png()
      .toBuffer()
  );
}
