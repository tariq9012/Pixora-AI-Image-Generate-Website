import { eq } from "drizzle-orm";
import sharp from "sharp";

import { db } from "@/db/client.server";
import { assets, users } from "@/db/schema";

import { buildStorageKey } from "./paths";
import { getStorageProvider } from "./provider.server";
import type { AssetPurpose } from "./types";
import { ASSET_VISIBILITY } from "./types";
import { FileValidationError, validateImageBuffer, type AllowedMimeType } from "./validation";

/**
 * PHASE 14 (privacy): purposes whose files are served from a PUBLIC URL and
 * come straight from the user's device (avatars, project covers). Phone
 * photos routinely carry GPS coordinates and device metadata in EXIF, so
 * these are re-encoded without metadata before being stored. Orientation is
 * normalized FIRST (`.rotate()` applies the EXIF orientation and drops the
 * tag), so images are not displayed sideways afterwards. The ICC profile is
 * kept so colors don't shift. Private AI-tool inputs keep their original
 * bytes (they are only ever read server-side, and every tool pipeline
 * already applies `.rotate()` itself); generated/processed outputs come out
 * of sharp pipelines that emit no EXIF by default.
 */
const METADATA_STRIPPED_PURPOSES: ReadonlySet<AssetPurpose> = new Set<AssetPurpose>([
  "AVATAR",
  "PROJECT_COVER",
]);

async function stripImageMetadata(
  buffer: Buffer,
  mimeType: AllowedMimeType,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const base = sharp(buffer, { failOn: "error", limitInputPixels: 40_000_000 })
    .rotate()
    .keepIccProfile();

  const encoded =
    mimeType === "image/jpeg"
      ? base.jpeg({ quality: 92 })
      : mimeType === "image/png"
        ? base.png()
        : base.webp({ quality: 92 });

  const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

export type UploadedAsset = {
  id: string;
  url: string;
  mimeType: string;
  width: number;
  height: number;
  purpose: AssetPurpose;
};

export class AssetNotFoundError extends Error {
  constructor() {
    // Same message/shape whether the asset doesn't exist or belongs to
    // someone else — never reveal which to the caller.
    super("Asset not found.");
    this.name = "AssetNotFoundError";
  }
}

/**
 * Validates, stores, and records one uploaded image. `userId` must come
 * from the authenticated session — never from client input (see the
 * upload route, which is the only caller).
 *
 * Ordering: storage write happens BEFORE the DB insert. If the DB insert
 * then fails, the just-written object is deleted so it doesn't become an
 * untracked orphan.
 */
export async function uploadAsset(input: {
  userId: string;
  purpose: AssetPurpose;
  buffer: Buffer;
  declaredMimeType: string;
  originalFilename?: string;
}): Promise<UploadedAsset> {
  const validated = await validateImageBuffer(input.buffer, input.purpose, input.declaredMimeType);

  let storedBuffer = input.buffer;
  let storedWidth = validated.width;
  let storedHeight = validated.height;
  if (METADATA_STRIPPED_PURPOSES.has(input.purpose)) {
    try {
      const cleaned = await stripImageMetadata(input.buffer, validated.mimeType);
      storedBuffer = cleaned.buffer;
      storedWidth = cleaned.width;
      storedHeight = cleaned.height;
    } catch {
      // A file that passed magic-byte + header validation but cannot be
      // decoded is malformed — reject it rather than store it as-is.
      throw new FileValidationError(
        "UNREADABLE_IMAGE",
        "Couldn't read this image. It may be corrupted.",
      );
    }
  }

  const provider = getStorageProvider();
  const key = buildStorageKey(input.userId, input.purpose, validated.extension);

  await provider.putObject({ key, body: storedBuffer, contentType: validated.mimeType });

  const url =
    ASSET_VISIBILITY[input.purpose] === "public"
      ? provider.getPublicUrl(key)
      : await provider.getSignedUrl(key);

  try {
    const [created] = await db
      .insert(assets)
      .values({
        userId: input.userId,
        storageProvider: provider.name,
        storageKey: key,
        url,
        mimeType: validated.mimeType,
        fileSize: storedBuffer.byteLength,
        width: storedWidth,
        height: storedHeight,
        originalFilename: input.originalFilename ? input.originalFilename.slice(0, 255) : null,
        purpose: input.purpose,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create asset record.");
    }

    return {
      id: created.id,
      url: created.url,
      mimeType: created.mimeType ?? validated.mimeType,
      width: created.width ?? storedWidth,
      height: created.height ?? storedHeight,
      purpose: input.purpose,
    };
  } catch (dbError) {
    try {
      await provider.deleteObject(key);
    } catch (cleanupError) {
      console.error("Failed to clean up orphaned storage object after DB failure:", cleanupError);
    }
    throw dbError;
  }
}

export class SourceAssetUnavailableError extends Error {
  constructor() {
    super("The source image could not be loaded.");
    this.name = "SourceAssetUnavailableError";
  }
}

/**
 * Phase 7: loads an already-uploaded asset's row AND its raw bytes,
 * enforcing ownership + purpose in one place so every AI tool that takes
 * an existing asset as input (Image-to-Image today, Upscale/Background
 * Removal/Outpaint/Editor in later phases) shares the same check instead
 * of re-implementing it. Never trusts a client-provided storage key or
 * user id — `userId` must come from the authenticated session, and the
 * asset is looked up by id only, then its owner is compared server-side.
 *
 * Throws `AssetNotFoundError` for anything that should look identical
 * from the outside whether the asset doesn't exist or belongs to someone
 * else (wrong id, wrong owner, wrong purpose) — never leaks which. Throws
 * `SourceAssetUnavailableError` separately for the case where the DB row
 * is fine but the underlying storage object is missing (e.g. deleted out
 * from under it), since that's a different, retryable-by-reupload failure
 * mode a caller may want to report differently.
 */
export async function getAssetBufferForUser(
  userId: string,
  assetId: string,
  allowedPurposes: readonly AssetPurpose[],
): Promise<{ buffer: Buffer; mimeType: string; url: string; asset: typeof assets.$inferSelect }> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));

    if (
    !asset ||
    asset.userId !== userId ||
    !(allowedPurposes as readonly string[]).includes(asset.purpose)
  ) {
    throw new AssetNotFoundError();
  }

  const provider = getStorageProvider();

  let buffer: Buffer;
  try {
    buffer = await provider.getObjectBuffer(asset.storageKey);
  } catch (error) {
    console.error("Failed to read source asset from storage:", error);
    throw new SourceAssetUnavailableError();
  }

  if (buffer.byteLength === 0) {
    throw new SourceAssetUnavailableError();
  }

  return { buffer, mimeType: asset.mimeType ?? "", url: asset.url, asset };
}

/** Deletes an asset only if it belongs to `userId`. Storage object first, then the DB row. */
export async function deleteAssetForUser(userId: string, assetId: string): Promise<void> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));

  if (!asset || asset.userId !== userId) {
    throw new AssetNotFoundError();
  }

  const provider = getStorageProvider();
  await provider.deleteObject(asset.storageKey);
  await db.delete(assets).where(eq(assets.id, assetId));
}

/**
 * Points `users.avatarUrl`/`avatarAssetId` at an already-uploaded AVATAR
 * asset, then deletes the PREVIOUS avatar's storage object — only after
 * the swap to the new one has already succeeded, so a problem here never
 * costs the user their working avatar.
 */
export async function setUserAvatarFromAsset(userId: string, assetId: string): Promise<string> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));

  if (!asset || asset.userId !== userId || asset.purpose !== "AVATAR") {
    throw new AssetNotFoundError();
  }

  const [previousUser] = await db
    .select({ avatarAssetId: users.avatarAssetId })
    .from(users)
    .where(eq(users.id, userId));

  await db
    .update(users)
    .set({ avatarUrl: asset.url, avatarAssetId: asset.id })
    .where(eq(users.id, userId));

  const previousAssetId = previousUser?.avatarAssetId;
  if (previousAssetId && previousAssetId !== asset.id) {
    try {
      await deleteAssetForUser(userId, previousAssetId);
    } catch (error) {
      // Non-fatal: the avatar has already switched over successfully;
      // failing to clean up the old file shouldn't surface as an error.
      console.error("Failed to delete previous avatar asset:", error);
    }
  }

  return asset.url;
}
