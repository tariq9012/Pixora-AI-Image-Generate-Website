export const ASSET_PURPOSES = [
  "AVATAR",
  "AI_INPUT",
  "IMAGE_TO_IMAGE_INPUT",
  "BACKGROUND_REMOVAL_INPUT",
  "UPSCALE_INPUT",
  "OUTPAINT_INPUT",
  "EDITOR_INPUT",
  "PROJECT_COVER",
  "GENERATED_OUTPUT",
] as const;

export type AssetPurpose = (typeof ASSET_PURPOSES)[number];

/**
 * Public assets (avatars, project covers, eventually published creations)
 * get a directly fetchable URL. Everything a user uploads as raw working
 * material (AI tool inputs) is private and only ever exposed via a
 * short-lived signed URL — see storage.server.ts and the S3 provider.
 */
export const ASSET_VISIBILITY: Record<AssetPurpose, "public" | "private"> = {
  AVATAR: "public",
  PROJECT_COVER: "public",
  GENERATED_OUTPUT: "public", // not produced until Phase 6, but already correct
  AI_INPUT: "private",
  IMAGE_TO_IMAGE_INPUT: "private",
  BACKGROUND_REMOVAL_INPUT: "private",
  UPSCALE_INPUT: "private",
  OUTPAINT_INPUT: "private",
  EDITOR_INPUT: "private",
};

export type PutObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

/**
 * Every storage backend (local dev fallback, S3-compatible bucket, ...)
 * implements this same shape. Nothing outside src/lib/storage should ever
 * import an S3 SDK type or touch the filesystem directly — go through a
 * StorageProvider (see provider.server.ts) instead.
 */
export interface StorageProvider {
  readonly name: "local" | "s3";
  putObject(input: PutObjectInput): Promise<void>;
  deleteObject(key: string): Promise<void>;
  /** Directly fetchable URL — only correct for `public` visibility assets. */
  getPublicUrl(key: string): string;
  /** Short-lived signed URL — used for `private` visibility assets. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  /**
   * Reads an object's bytes directly, server-side — added in Phase 7 so an
   * AI provider call can be handed the actual image data without ever
   * exposing a (potentially private) storage URL to a third party. Works
   * identically against local dev storage and S3-compatible storage; the
   * caller never needs to know which backend is active. Throws an error
   * with `code === "ENOENT"` (local) or the S3 SDK's own not-found error
   * when the object doesn't exist — callers should treat any rejection
   * here as "the object is missing," not assume a specific shape.
   */
  getObjectBuffer(key: string): Promise<Buffer>;
}
