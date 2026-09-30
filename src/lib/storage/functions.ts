import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth/guards.server";

import { AssetNotFoundError, deleteAssetForUser, setUserAvatarFromAsset } from "./storage.server";

export type AssetActionResult =
  { success: true } | { success: false; code: string; message: string };

export type SetAvatarResult =
  { success: true; avatarUrl: string } | { success: false; code: string; message: string };

function toErrorResult(error: unknown, fallbackLog: string): { code: string; message: string } {
  if (error instanceof AssetNotFoundError) {
    return { code: "NOT_FOUND", message: error.message };
  }
  console.error(fallbackLog, error);
  return { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." };
}

export const deleteAssetFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "string" || input.length === 0) {
      throw new Error("An asset id is required.");
    }
    return input;
  })
  .handler(async ({ data: assetId }): Promise<AssetActionResult> => {
    const user = await requireUser();
    try {
      await deleteAssetForUser(user.id, assetId);
      return { success: true };
    } catch (error) {
      return { success: false, ...toErrorResult(error, "Asset delete failed:") };
    }
  });

export const setAvatarFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "string" || input.length === 0) {
      throw new Error("An asset id is required.");
    }
    return input;
  })
  .handler(async ({ data: assetId }): Promise<SetAvatarResult> => {
    const user = await requireUser();
    try {
      const avatarUrl = await setUserAvatarFromAsset(user.id, assetId);
      return { success: true, avatarUrl };
    } catch (error) {
      return { success: false, ...toErrorResult(error, "Set-avatar failed:") };
    }
  });
