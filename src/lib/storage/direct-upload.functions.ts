import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth/guards.server";

import {
  DirectUploadError,
  createUploadIntent,
  finalizeUploadIntent,
  type CreateUploadIntentResult,
} from "./direct-upload.server";
import type { UploadedAsset } from "./storage.server";

/**
 * PHASE 14A server functions. TanStack server functions are already covered
 * by the same-origin/CSRF middleware in src/start.ts, and identity comes
 * only from the session (`requireUser`) — never from the request body.
 */

export type CreateUploadIntentFnResult =
  | ({ success: true } & CreateUploadIntentResult)
  | { success: false; code: string; message: string; retryable: boolean };

export type FinalizeUploadFnResult =
  | { success: true; asset: UploadedAsset }
  | { success: false; code: string; message: string; retryable: boolean };

function toFailure(
  error: unknown,
  logLabel: string,
): { success: false; code: string; message: string; retryable: boolean } {
  if (error instanceof DirectUploadError) {
    return { success: false, code: error.code, message: error.message, retryable: error.retryable };
  }
  console.error(logLabel, error instanceof Error ? `${error.name}: ${error.message}` : "unknown");
  return {
    success: false,
    code: "INTERNAL_ERROR",
    message: "Something went wrong. Please try again.",
    retryable: true,
  };
}

export const createUploadIntentFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (typeof input === "object" && input !== null ? input : {}) as Record<
      string,
      unknown
    >;
    return {
      purpose: typeof raw["purpose"] === "string" ? raw["purpose"] : "",
      filename: typeof raw["filename"] === "string" ? raw["filename"] : "",
      mimeType: typeof raw["mimeType"] === "string" ? raw["mimeType"] : "",
      size: typeof raw["size"] === "number" ? raw["size"] : Number.NaN,
    };
  })
  .handler(async ({ data }): Promise<CreateUploadIntentFnResult> => {
    const user = await requireUser();
    try {
      const result = await createUploadIntent(user.id, data);
      return { success: true, ...result };
    } catch (error) {
      return toFailure(error, "Create upload intent failed:");
    }
  });

export const finalizeUploadFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (typeof input === "object" && input !== null ? input : {}) as Record<
      string,
      unknown
    >;
    return { intentId: typeof raw["intentId"] === "string" ? raw["intentId"] : "" };
  })
  .handler(async ({ data }): Promise<FinalizeUploadFnResult> => {
    const user = await requireUser();
    try {
      const asset = await finalizeUploadIntent(user.id, data.intentId);
      return { success: true, asset };
    } catch (error) {
      return toFailure(error, "Finalize upload failed:");
    }
  });
