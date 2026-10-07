import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { PutObjectInput, StorageProvider } from "../types";

export const LOCAL_STORAGE_ROOT = join(process.cwd(), "storage", "dev");

/**
 * Development-only fallback: writes real files to storage/dev/ on this
 * machine's disk. NEVER selected in production — env.server.ts's
 * superRefine fails validation at boot if NODE_ENV=production and
 * STORAGE_PROVIDER isn't "s3", so this module simply isn't reachable
 * there.
 *
 * Public and private URLs are the SAME dev-only serving route here
 * (src/routes/api.assets.local.$.ts) — unlike the S3 provider's real
 * public URLs vs short-lived signed URLs, local dev does not enforce the
 * public/private access distinction. Don't treat this as representative
 * of production access control.
 */
export function createLocalStorageProvider(): StorageProvider {
  function absolutePathFor(key: string): string {
    return join(LOCAL_STORAGE_ROOT, key);
  }

  return {
    name: "local",
    supportsDirectUpload: false,
    async putObject({ key, body }: PutObjectInput) {
      const path = absolutePathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },
    async deleteObject(key: string) {
      try {
        await rm(absolutePathFor(key));
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw error;
      }
    },
    getPublicUrl(key: string) {
      return `/api/assets/local/${key}`;
    },
    async getSignedUrl(key: string) {
      // No real signing locally — see the visibility caveat above.
      return `/api/assets/local/${key}`;
    },
    async getObjectBuffer(key: string) {
      return readFile(absolutePathFor(key));
    },
    async createPresignedPutUrl() {
      // Local dev uses the server upload route (POST /api/assets/upload).
      throw new Error("Direct upload is not supported by the local storage provider.");
    },
    async headObject(key: string) {
      try {
        const info = await stat(absolutePathFor(key));
        return { size: info.size, contentType: null };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
  };
}
