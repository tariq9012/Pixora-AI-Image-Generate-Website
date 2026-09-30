import { maxUploadSizeFor } from "@/lib/storage/validation";

import { GenerationError } from "./errors.server";

const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_DOWNLOAD_BYTES = maxUploadSizeFor("GENERATED_OUTPUT");

export type DownloadedImage = {
  buffer: Buffer;
  /** Empty string if the response didn't declare one — validateImageBuffer
   * treats an empty declared type as "skip the declared-vs-actual check",
   * so this never causes a false MIME_MISMATCH; the real type is still
   * authoritatively determined from magic bytes either way. */
  contentType: string;
};

/**
 * Fetches a provider-hosted image URL server-side into a Buffer. This is
 * deliberately NOT the authoritative validation step — it only guards
 * against downloading something absurdly large or an outright failed
 * request. The buffer this returns still goes through Phase 5's full
 * `validateImageBuffer` (magic bytes, dimensions, allow-listed MIME types)
 * inside `uploadAsset()` before anything is trusted as a real image, so an
 * HTML error page or unexpected content type masquerading as an image
 * still gets rejected there, not here.
 */
export async function downloadProviderImage(url: string): Promise<DownloadedImage> {
  // PHASE 14 (SSRF hardening): this URL comes from an AI provider response,
  // never from the browser, but still refuse anything that is not plain
  // https so a compromised/buggy provider payload cannot point the server
  // at http://, file:// or an internal address literal.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new GenerationError("OUTPUT_DOWNLOAD_FAILED", "Failed to download the generated image.");
  }
  if (
    parsed.protocol !== "https:" ||
    /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/.test(parsed.hostname)
  ) {
    throw new GenerationError("OUTPUT_DOWNLOAD_FAILED", "Failed to download the generated image.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new GenerationError(
        "OUTPUT_DOWNLOAD_FAILED",
        "Failed to download the generated image.",
      );
    }

    const declaredLength = response.headers.get("content-length");
    if (declaredLength && Number(declaredLength) > MAX_DOWNLOAD_BYTES) {
      throw new GenerationError("OUTPUT_DOWNLOAD_FAILED", "The generated image was too large.");
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new GenerationError("OUTPUT_DOWNLOAD_FAILED", "The generated image was too large.");
    }

    // Only trust this as a HINT (see DownloadedImage's contentType doc)
    // — never as the sole basis for accepting the file as an image.
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";

    return { buffer: Buffer.from(arrayBuffer), contentType };
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    console.error("Failed to download provider output:", error);
    throw new GenerationError("OUTPUT_DOWNLOAD_FAILED", "Failed to download the generated image.");
  } finally {
    clearTimeout(timeout);
  }
}
