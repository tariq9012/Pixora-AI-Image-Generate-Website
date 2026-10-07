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
 * PHASE 14A: the ONLY purposes a browser is allowed to request an upload
 * for (direct-to-R2 flow AND the legacy multipart route). Everything else
 * is system-only: GENERATED_OUTPUT is produced by the server after a real
 * generation, and AI_INPUT / PROJECT_COVER have no upload UI today. Before
 * this allowlist, the legacy route accepted ANY purpose from the client —
 * including GENERATED_OUTPUT, which is served from a public URL.
 */
export const USER_UPLOAD_PURPOSES = [
  "AVATAR",
  "IMAGE_TO_IMAGE_INPUT",
  "BACKGROUND_REMOVAL_INPUT",
  "UPSCALE_INPUT",
  "OUTPAINT_INPUT",
  "EDITOR_INPUT",
] as const satisfies readonly AssetPurpose[];

export type UserUploadPurpose = (typeof USER_UPLOAD_PURPOSES)[number];

export function isUserUploadPurpose(value: unknown): value is UserUploadPurpose {
  return typeof value === "string" && (USER_UPLOAD_PURPOSES as readonly string[]).includes(value);
}

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
  /**
   * PHASE 14A: true only for backends that can hand the BROWSER a
   * short-lived presigned PUT URL (S3-compatible / R2). The local dev
   * provider is false, so local development keeps the existing server
   * upload route unchanged.
   */
  readonly supportsDirectUpload: boolean;
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
  /**
   * PHASE 14A: presigned PUT for a single object at a SERVER-CHOSEN key.
   * The returned `headers` MUST be sent by the browser exactly as given
   * (Content-Type is part of the signature). Throws on providers with
   * `supportsDirectUpload === false`.
   */
  createPresignedPutUrl(input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; headers: Record<string, string> }>;
  /** PHASE 14A: object metadata WITHOUT downloading it; `null` if missing. */
  headObject(key: string): Promise<{ size: number; contentType: string | null } | null>;
}
