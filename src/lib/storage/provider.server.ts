import { env } from "@/lib/env.server";

import { createLocalStorageProvider } from "./providers/local.server";
import { createS3StorageProvider } from "./providers/s3.server";
import type { StorageProvider } from "./types";

let cached: StorageProvider | undefined;

/**
 * The only place in the app that decides WHICH backend to use. Everything
 * else calls the returned StorageProvider's generic methods and never
 * knows or cares whether it's talking to local disk or S3.
 *
 * The `s3` branch's non-null assertions are safe: env.server.ts's
 * superRefine already guarantees every S3_* variable is set whenever
 * STORAGE_PROVIDER=s3, and refuses to boot otherwise.
 */
export function getStorageProvider(): StorageProvider {
  if (cached) return cached;

  if (env.STORAGE_PROVIDER === "s3") {
    cached = createS3StorageProvider({
      endpoint: env.S3_ENDPOINT!,
      region: env.S3_REGION!,
      bucket: env.S3_BUCKET!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      publicBaseUrl: env.S3_PUBLIC_BASE_URL!,
    });
  } else {
    cached = createLocalStorageProvider();
  }

  return cached;
}
