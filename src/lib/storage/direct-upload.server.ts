import { and, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db/client.server";
import { assets, uploadIntents } from "@/db/schema";
import { checkRateLimit } from "@/lib/auth/rate-limit.server";

import { buildPendingUploadKey } from "./paths";
import { getStorageProvider } from "./provider.server";
import { deleteAssetForUser, uploadAsset, type UploadedAsset } from "./storage.server";
import { ASSET_VISIBILITY, isUserUploadPurpose, type UserUploadPurpose } from "./types";
import {
  FileValidationError,
  extensionForMime,
  isAllowedMimeType,
  maxUploadSizeFor,
} from "./validation";

/**
 * PHASE 14A — direct-to-R2 uploads.
 *
 *   browser --(1) createUploadIntent-->  Pixora   (small JSON; auth + limits)
 *   browser --(2) PUT bytes ----------->  R2      (presigned; never touches Vercel)
 *   browser --(3) finalizeUploadIntent->  Pixora   (small JSON; validates the REAL object)
 *
 * Nothing is trusted because R2 accepted the PUT. Finalize reads the actual
 * bytes back, runs the same validation as the legacy route (`uploadAsset`),
 * and the SERVER writes the validated bytes to a fresh final key the client
 * never had a URL for. The client-writable "pending-uploads/..." object is
 * then deleted.
 */

/** Presigned URLs are bearer credentials while valid — keep them short. */
export const PRESIGN_EXPIRES_SECONDS = 300;
/** Finalize is accepted until this long after the intent was created. */
const INTENT_LIFETIME_MS = 20 * 60 * 1000;
/** A finalize that dies mid-flight can be re-claimed after this long. */
const CLAIM_STALE_MS = 2 * 60 * 1000;
const MAX_PENDING_INTENTS_PER_USER = 10;

export class DirectUploadError extends Error {
  code: string;
  /** true => the client may simply call finalize again with the same intent. */
  retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "DirectUploadError";
    this.code = code;
    this.retryable = retryable;
  }
}

/** Name/code/short message only — never bodies, headers, URLs or env values. */
function describeError(error: unknown): Record<string, string | undefined> {
  if (!(error instanceof Error)) return { message: String(error).slice(0, 300) };
  const withCode = error as Error & { code?: unknown };
  return {
    name: error.name,
    code: withCode.code !== undefined ? String(withCode.code).slice(0, 80) : undefined,
    message: error.message.slice(0, 300),
  };
}

/**
 * Display-only. Keeps just the last path segment, drops control characters
 * and characters that are awkward in headers/file systems, and bounds the
 * length. It is NEVER used to build a storage key.
 */
function sanitizeFilename(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const lastSegment = value.split(/[\\/]/).pop() ?? "";
  const printable = Array.from(lastSegment)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
  const cleaned = printable.replace(/[<>:"|?*]/g, "_").trim().slice(0, 255);
  return cleaned.length > 0 ? cleaned : null;
}

export type CreateUploadIntentInput = {
  purpose: unknown;
  filename: unknown;
  mimeType: unknown;
  size: unknown;
};

export type CreateUploadIntentResult =
  | { mode: "server" }
  | {
      mode: "direct";
      intentId: string;
      uploadUrl: string;
      headers: Record<string, string>;
      /** When the presigned URL stops working (ISO 8601). */
      expiresAt: string;
    };

export async function createUploadIntent(
  userId: string,
  input: CreateUploadIntentInput,
): Promise<CreateUploadIntentResult> {
  // 1) Purpose allowlist — the client cannot pick system-only purposes.
  if (!isUserUploadPurpose(input.purpose)) {
    throw new DirectUploadError("INVALID_PURPOSE", "This kind of upload isn't allowed.");
  }
  const purpose: UserUploadPurpose = input.purpose;

  // 2) Local development keeps the existing server upload route.
  const provider = getStorageProvider();
  if (!provider.supportsDirectUpload) {
    return { mode: "server" };
  }

  const rateLimit = checkRateLimit(`upload-intent:${userId}`, {
    max: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    throw new DirectUploadError("RATE_LIMITED", "Too many uploads. Please try again later.");
  }

  // 3) Declared MIME (bound into the signature below) and declared size.
  //    Both are only sanity checks: finalize re-verifies the real object.
  const mimeType = typeof input.mimeType === "string" ? input.mimeType.trim().toLowerCase() : "";
  if (!isAllowedMimeType(mimeType)) {
    throw new DirectUploadError(
      "UNSUPPORTED_FORMAT",
      "Unsupported image format. Please upload a JPEG, PNG, or WebP image.",
    );
  }

  const size = input.size;
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) {
    throw new DirectUploadError("EMPTY_FILE", "The selected file is empty.");
  }
  const sizeLimit = maxUploadSizeFor(purpose);
  if (size > sizeLimit) {
    throw new DirectUploadError(
      "FILE_TOO_LARGE",
      `File is too large. Maximum size is ${Math.round(sizeLimit / (1024 * 1024))} MB.`,
    );
  }

  // 4) Orphan-abuse guard: bounded number of open, unfinished intents.
  const [pending] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(uploadIntents)
    .where(
      and(
        eq(uploadIntents.userId, userId),
        isNull(uploadIntents.completedAt),
        gt(uploadIntents.expiresAt, new Date()),
      ),
    );
  if ((pending?.value ?? 0) >= MAX_PENDING_INTENTS_PER_USER) {
    throw new DirectUploadError(
      "TOO_MANY_PENDING_UPLOADS",
      "You have too many unfinished uploads. Please wait a few minutes and try again.",
    );
  }

  // 5) Server-generated key + persistent intent. The browser never chooses
  //    the bucket, prefix, user id, or any part of the key.
  const now = Date.now();
  const storageKey = buildPendingUploadKey(userId, extensionForMime(mimeType));

  const [intent] = await db
    .insert(uploadIntents)
    .values({
      userId,
      purpose,
      storageKey,
      expectedMimeType: mimeType,
      expectedSize: size,
      originalFilename: sanitizeFilename(input.filename),
      expiresAt: new Date(now + INTENT_LIFETIME_MS),
    })
    .returning({ id: uploadIntents.id });

  if (!intent) {
    throw new DirectUploadError("INTERNAL_ERROR", "Something went wrong. Please try again.", true);
  }

  try {
    const presigned = await provider.createPresignedPutUrl({
      key: storageKey,
      contentType: mimeType,
      expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
    });

    return {
      mode: "direct",
      intentId: intent.id,
      uploadUrl: presigned.url,
      headers: presigned.headers,
      expiresAt: new Date(now + PRESIGN_EXPIRES_SECONDS * 1000).toISOString(),
    };
  } catch (error) {
    console.error("[upload] could not create presigned URL:", describeError(error));
    await db
      .delete(uploadIntents)
      .where(eq(uploadIntents.id, intent.id))
      .catch(() => undefined);
    throw new DirectUploadError(
      "STORAGE_UNAVAILABLE",
      "File storage is temporarily unavailable. Please try again later.",
      true,
    );
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type IntentRow = typeof uploadIntents.$inferSelect;

async function toAssetDto(
  userId: string,
  assetId: string,
  purpose: UserUploadPurpose,
): Promise<UploadedAsset> {
  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.userId, userId)));

  if (!row) {
    throw new DirectUploadError("NOT_FOUND", "This upload could not be found.");
  }

  // Private assets store a signed URL that expires; hand back a fresh one.
  const provider = getStorageProvider();
  const url =
    ASSET_VISIBILITY[purpose] === "public"
      ? provider.getPublicUrl(row.storageKey)
      : await provider.getSignedUrl(row.storageKey);

  return {
    id: row.id,
    url,
    mimeType: row.mimeType ?? "",
    width: row.width ?? 0,
    height: row.height ?? 0,
    purpose,
  };
}

async function releaseClaim(intentId: string): Promise<void> {
  await db
    .update(uploadIntents)
    .set({ finalizeClaimedAt: null })
    .where(and(eq(uploadIntents.id, intentId), isNull(uploadIntents.completedAt)))
    .catch((error: unknown) => console.error("[upload] release claim failed:", describeError(error)));
}

/**
 * Permanent rejection: the object is untrusted. Invalidate the intent (so a
 * retry can't resurrect it) and delete the object where possible. A failed
 * delete is logged; the bucket lifecycle rule / cleanup job covers it.
 */
async function rejectIntent(intent: IntentRow, code: string, message: string): Promise<never> {
  await db
    .update(uploadIntents)
    .set({ expiresAt: new Date(), finalizeClaimedAt: null })
    .where(and(eq(uploadIntents.id, intent.id), isNull(uploadIntents.completedAt)))
    .catch((error: unknown) => console.error("[upload] invalidate failed:", describeError(error)));

  try {
    await getStorageProvider().deleteObject(intent.storageKey);
  } catch (error) {
    console.error("[upload] cleanup of rejected object failed:", describeError(error));
  }

  throw new DirectUploadError(code, message, false);
}

export async function finalizeUploadIntent(
  userId: string,
  intentId: unknown,
): Promise<UploadedAsset> {
  // Only a server-issued UUID is accepted — never a key, bucket or user id.
  if (typeof intentId !== "string" || !UUID_PATTERN.test(intentId)) {
    throw new DirectUploadError("NOT_FOUND", "This upload could not be found.");
  }

  const rateLimit = checkRateLimit(`upload-finalize:${userId}`, {
    max: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    throw new DirectUploadError("RATE_LIMITED", "Too many uploads. Please try again later.");
  }

  // Scoped to the session user: another user's intent id is simply "not found".
  const [intent] = await db
    .select()
    .from(uploadIntents)
    .where(and(eq(uploadIntents.id, intentId), eq(uploadIntents.userId, userId)));

  if (!intent || !isUserUploadPurpose(intent.purpose)) {
    throw new DirectUploadError("NOT_FOUND", "This upload could not be found.");
  }
  const purpose: UserUploadPurpose = intent.purpose;

  // Idempotent: already finalized -> same asset, no second row.
  if (intent.completedAt && intent.assetId) {
    return toAssetDto(userId, intent.assetId, purpose);
  }

  const now = Date.now();
  if (intent.expiresAt.getTime() <= now) {
    try {
      await getStorageProvider().deleteObject(intent.storageKey);
    } catch (error) {
      console.error("[upload] cleanup of expired object failed:", describeError(error));
    }
    throw new DirectUploadError("UPLOAD_EXPIRED", "This upload expired. Please upload the file again.");
  }

  // Atomic claim: exactly one concurrent finalize proceeds.
  const [claimed] = await db
    .update(uploadIntents)
    .set({ finalizeClaimedAt: new Date(now) })
    .where(
      and(
        eq(uploadIntents.id, intent.id),
        eq(uploadIntents.userId, userId),
        isNull(uploadIntents.completedAt),
        or(
          isNull(uploadIntents.finalizeClaimedAt),
          lt(uploadIntents.finalizeClaimedAt, new Date(now - CLAIM_STALE_MS)),
        ),
      ),
    )
    .returning({ id: uploadIntents.id });

  if (!claimed) {
    const [latest] = await db
      .select()
      .from(uploadIntents)
      .where(and(eq(uploadIntents.id, intent.id), eq(uploadIntents.userId, userId)));
    if (latest?.completedAt && latest.assetId) {
      return toAssetDto(userId, latest.assetId, purpose);
    }
    throw new DirectUploadError(
      "FINALIZE_IN_PROGRESS",
      "This upload is still being processed.",
      true,
    );
  }

  try {
    return await runFinalize(userId, intent, purpose);
  } catch (error) {
    // Retryable failures (missing object yet, storage/DB hiccup) keep the
    // intent usable; permanent ones already invalidated it in rejectIntent.
    if (error instanceof DirectUploadError && !error.retryable) throw error;
    await releaseClaim(intent.id);
    throw error;
  }
}

async function runFinalize(
  userId: string,
  intent: IntentRow,
  purpose: UserUploadPurpose,
): Promise<UploadedAsset> {
  const provider = getStorageProvider();

  // A) Look at the object WITHOUT downloading it.
  let head: { size: number; contentType: string | null } | null;
  try {
    head = await provider.headObject(intent.storageKey);
  } catch (error) {
    console.error("[upload] HeadObject failed:", describeError(error));
    throw new DirectUploadError(
      "STORAGE_UNAVAILABLE",
      "File storage is temporarily unavailable. Please try again.",
      true,
    );
  }
  if (!head) {
    throw new DirectUploadError(
      "UPLOAD_NOT_FOUND",
      "We couldn't find the uploaded file. Please try uploading again.",
      true,
    );
  }

  // B) Actual size is authoritative — checked BEFORE reading it into memory.
  const limit = maxUploadSizeFor(purpose);
  if (head.size <= 0) {
    return rejectIntent(intent, "EMPTY_FILE", "The uploaded file is empty.");
  }
  if (head.size > limit) {
    return rejectIntent(
      intent,
      "FILE_TOO_LARGE",
      `File is too large. Maximum size is ${Math.round(limit / (1024 * 1024))} MB.`,
    );
  }
  if (head.size !== intent.expectedSize) {
    return rejectIntent(
      intent,
      "SIZE_MISMATCH",
      "The uploaded file doesn't match what was requested. Please try again.",
    );
  }

  // C) The Content-Type R2 stored must be the one that was signed.
  const storedType = head.contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (storedType !== intent.expectedMimeType) {
    return rejectIntent(
      intent,
      "MIME_MISMATCH",
      "The file's contents don't match its declared type.",
    );
  }

  // D) Read the bytes (bounded by the size check above).
  let buffer: Buffer;
  try {
    buffer = await provider.getObjectBuffer(intent.storageKey);
  } catch (error) {
    console.error("[upload] reading uploaded object failed:", describeError(error));
    throw new DirectUploadError(
      "STORAGE_UNAVAILABLE",
      "File storage is temporarily unavailable. Please try again.",
      true,
    );
  }
  if (buffer.byteLength !== head.size) {
    // The object changed between HEAD and GET — not something to trust.
    return rejectIntent(intent, "UPLOAD_CHANGED", "The upload changed while it was being checked.");
  }

  // E) The SAME authoritative pipeline the legacy route uses: magic bytes,
  //    MIME vs signature, decode/dimensions/pixel limits, EXIF stripping for
  //    public purposes, write to a FRESH final key, insert the assets row.
  let asset: UploadedAsset;
  try {
    asset = await uploadAsset({
      userId,
      purpose,
      buffer,
      declaredMimeType: intent.expectedMimeType,
      ...(intent.originalFilename ? { originalFilename: intent.originalFilename } : {}),
    });
  } catch (error) {
    if (error instanceof FileValidationError) {
      return rejectIntent(intent, error.code, error.message);
    }
    console.error("[upload] storing validated upload failed:", describeError(error));
    throw new DirectUploadError(
      "FINALIZE_FAILED",
      "We couldn't finish processing your upload. Please try again.",
      true,
    );
  }

  // F) Mark complete. If this fails, remove the just-created asset so a
  //    retry doesn't leave two.
  try {
    const [done] = await db
      .update(uploadIntents)
      .set({ completedAt: new Date(), assetId: asset.id, finalizeClaimedAt: null })
      .where(and(eq(uploadIntents.id, intent.id), isNull(uploadIntents.completedAt)))
      .returning({ id: uploadIntents.id });
    if (!done) throw new Error("Intent was no longer open.");
  } catch (error) {
    console.error("[upload] completing intent failed:", describeError(error));
    await deleteAssetForUser(userId, asset.id).catch((cleanupError: unknown) =>
      console.error("[upload] cleanup of duplicate asset failed:", describeError(cleanupError)),
    );
    throw new DirectUploadError(
      "FINALIZE_FAILED",
      "We couldn't finish processing your upload. Please try again.",
      true,
    );
  }

  // G) The client-writable object is no longer needed. Best effort; the
  //    lifecycle rule on `pending-uploads/` is the backstop.
  try {
    await provider.deleteObject(intent.storageKey);
  } catch (error) {
    console.error("[upload] could not delete pending object:", describeError(error));
  }

  return asset;
}

/**
 * Orphan cleanup: unfinished intents past their lifetime (a user authorized
 * an upload, maybe even PUT the bytes, and never finalized). Deletes the
 * pending object, then the intent row; also trims old completed rows.
 * Safe to run repeatedly. Not wired to a scheduler yet — call it from the
 * same cron that will reconcile stuck generations (see docs/PRODUCTION.md).
 */
export async function cleanupExpiredUploadIntents(limit = 100): Promise<{
  scanned: number;
  deleted: number;
  failed: number;
  completedRowsTrimmed: number;
}> {
  const provider = getStorageProvider();
  const expired = await db
    .select({ id: uploadIntents.id, storageKey: uploadIntents.storageKey })
    .from(uploadIntents)
    .where(
      and(
        isNull(uploadIntents.completedAt),
        lt(uploadIntents.expiresAt, new Date(Date.now() - 60_000)),
      ),
    )
    .limit(limit);

  let deleted = 0;
  let failed = 0;
  for (const row of expired) {
    try {
      await provider.deleteObject(row.storageKey); // deleting a missing key is not an error
      await db.delete(uploadIntents).where(eq(uploadIntents.id, row.id));
      deleted += 1;
    } catch (error) {
      failed += 1;
      console.error("[upload] orphan cleanup failed:", describeError(error));
    }
  }

  const trimmed = await db
    .delete(uploadIntents)
    .where(
      and(
        isNotNull(uploadIntents.completedAt),
        lt(uploadIntents.completedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      ),
    )
    .returning({ id: uploadIntents.id });

  return { scanned: expired.length, deleted, failed, completedRowsTrimmed: trimmed.length };
}
