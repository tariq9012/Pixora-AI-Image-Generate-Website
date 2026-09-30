import { fileTypeFromBuffer } from "file-type";
import imageSize from "image-size";

import type { AssetPurpose } from "./types";

export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const EXTENSION_BY_MIME: Record<AllowedMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Deliberately centralized instead of scattered magic numbers per tool page.
const SIZE_LIMITS_BYTES: Record<AssetPurpose, number> = {
  AVATAR: 5 * 1024 * 1024, // 5 MB
  AI_INPUT: 20 * 1024 * 1024,
  // Lower than the other *_INPUT purposes on purpose: the Cloudflare
  // Workers AI img2img model only accepts the source image as a raw
  // JSON number array (see cloudflare-workers-ai.server.ts), which
  // inflates roughly 4x over the file's byte size on the wire — a 20MB
  // file would become an ~80MB request body. 8MB keeps that reasonable.
  IMAGE_TO_IMAGE_INPUT: 8 * 1024 * 1024,
  BACKGROUND_REMOVAL_INPUT: 20 * 1024 * 1024,
  UPSCALE_INPUT: 20 * 1024 * 1024,
  OUTPAINT_INPUT: 20 * 1024 * 1024,
  EDITOR_INPUT: 20 * 1024 * 1024,
  PROJECT_COVER: 10 * 1024 * 1024,
  GENERATED_OUTPUT: 20 * 1024 * 1024,
};

// Guards against decompression-bomb-style images (huge dimensions hidden
// behind a small file size) regardless of which purpose is uploading.
const MAX_DIMENSION_PX = 8000;
const MAX_TOTAL_PIXELS = 40_000_000; // e.g. ~7100x5600 — generous but bounded

export class FileValidationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FileValidationError";
    this.code = code;
  }
}

export function maxUploadSizeFor(purpose: AssetPurpose): number {
  return SIZE_LIMITS_BYTES[purpose];
}

export type ValidatedImage = {
  mimeType: AllowedMimeType;
  extension: string;
  width: number;
  height: number;
};

function looksLikeAllowedImage(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const webp =
    buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  return jpeg || png || webp;
}

/**
 * Authoritative, server-side validation. Never trusts the browser's
 * `accept=` filter or the client-declared MIME type — the ACTUAL file
 * signature (magic bytes, via `file-type`) decides what this file is.
 * SVG is never accepted (no sanitizer is in place for it), and there is
 * no path where an unrecognized signature falls through as "probably
 * fine".
 */
export async function validateImageBuffer(
  buffer: Buffer,
  purpose: AssetPurpose,
  declaredMimeType: string,
): Promise<ValidatedImage> {
  if (buffer.byteLength === 0) {
    throw new FileValidationError("EMPTY_FILE", "The uploaded file is empty.");
  }

  const sizeLimit = maxUploadSizeFor(purpose);
  if (buffer.byteLength > sizeLimit) {
    throw new FileValidationError(
      "FILE_TOO_LARGE",
      `File is too large. Maximum size is ${Math.round(sizeLimit / (1024 * 1024))} MB.`,
    );
  }

  // PHASE 14: `npm audit` reports a DoS (infinite loop) in file-type's ASF
  // parser on malformed input. We only accept JPEG/PNG/WebP, so only run
  // file-type when the leading bytes already look like one of those; every
  // other format (ASF included) is rejected here without being parsed.
  if (!looksLikeAllowedImage(buffer)) {
    throw new FileValidationError(
      "UNSUPPORTED_FORMAT",
      "Unsupported image format. Please upload a JPEG, PNG, or WebP image.",
    );
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !(ALLOWED_MIME_TYPES as readonly string[]).includes(detected.mime)) {
    throw new FileValidationError(
      "UNSUPPORTED_FORMAT",
      "Unsupported image format. Please upload a JPEG, PNG, or WebP image.",
    );
  }
  const mimeType = detected.mime as AllowedMimeType;

  // A mismatch between what the browser claimed and what the file
  // signature actually shows is the classic "renamed .exe to .png" attack.
  if (declaredMimeType && declaredMimeType.startsWith("image/") && declaredMimeType !== mimeType) {
    throw new FileValidationError(
      "MIME_MISMATCH",
      "The file's contents don't match its declared type.",
    );
  }

  let dimensions: { width?: number | undefined; height?: number | undefined };
  try {
    dimensions = imageSize(buffer);
  } catch {
    throw new FileValidationError(
      "UNREADABLE_IMAGE",
      "Couldn't read this image. It may be corrupted.",
    );
  }

  const { width, height } = dimensions;
  if (!width || !height) {
    throw new FileValidationError(
      "UNREADABLE_IMAGE",
      "Couldn't read this image. It may be corrupted.",
    );
  }

  if (width > MAX_DIMENSION_PX || height > MAX_DIMENSION_PX) {
    throw new FileValidationError(
      "DIMENSIONS_TOO_LARGE",
      `Image dimensions are too large. Maximum is ${MAX_DIMENSION_PX}px on each side.`,
    );
  }

  if (width * height > MAX_TOTAL_PIXELS) {
    throw new FileValidationError(
      "DIMENSIONS_TOO_LARGE",
      "This image has too many total pixels to process safely.",
    );
  }

  return { mimeType, extension: EXTENSION_BY_MIME[mimeType], width, height };
}
