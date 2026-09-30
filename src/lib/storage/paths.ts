import { randomUUID } from "node:crypto";

import type { AssetPurpose } from "./types";

const PURPOSE_FOLDER: Record<AssetPurpose, string> = {
  AVATAR: "avatars",
  AI_INPUT: "inputs",
  IMAGE_TO_IMAGE_INPUT: "inputs",
  BACKGROUND_REMOVAL_INPUT: "inputs",
  UPSCALE_INPUT: "inputs",
  OUTPAINT_INPUT: "inputs",
  EDITOR_INPUT: "inputs",
  PROJECT_COVER: "projects",
  GENERATED_OUTPUT: "outputs",
};

/**
 * Builds a safe, unpredictable storage key. NEVER derived from the
 * original filename or any other client-supplied string — only the
 * authenticated user's id (server-derived, never client-supplied — see
 * storage.server.ts), the asset's purpose, and a fresh random UUID.
 * `extension` is only ever one of the fixed values validation.ts produces
 * from a verified magic-byte match, never a client-controlled string, so
 * there is no path-traversal surface here.
 */
export function buildStorageKey(userId: string, purpose: AssetPurpose, extension: string): string {
  const folder = PURPOSE_FOLDER[purpose];
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const id = randomUUID();
  return `users/${userId}/${folder}/${year}/${month}/${id}.${extension}`;
}
