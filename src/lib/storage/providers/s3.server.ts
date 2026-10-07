import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { PutObjectInput, StorageProvider } from "../types";

/**
 * The AWS SDK v3 `Body` on a GetObjectCommand result is a generic
 * web/node stream union, not a Buffer — this collects it fully before
 * returning, matching the local provider's Buffer-returning contract.
 */
async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export type S3ProviderConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
};

/**
 * Works against any S3-compatible bucket (Cloudflare R2, AWS S3, Backblaze
 * B2, MinIO, ...) via the official `@aws-sdk/client-s3`. `forcePathStyle`
 * is on because R2/B2/MinIO generally require path-style addressing; real
 * AWS S3 still accepts it too, so this stays broadly compatible without
 * per-provider branching.
 */
export function createS3StorageProvider(config: S3ProviderConfig): StorageProvider {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });

  // PHASE 14A: a SEPARATE client used only for presigning. Recent AWS SDK v3
  // versions add a default CRC32 checksum to PutObject; when presigning,
  // that checksum (computed over an empty body) gets baked into the URL as
  // `x-amz-checksum-crc32=...` and every real browser upload then fails with
  // a checksum/signature error. `WHEN_REQUIRED` turns that default off
  // (Cloudflare's R2 + AWS SDK v3 guidance). The main client above is left
  // untouched so existing server-side uploads behave exactly as before.
  // Presigned URLs are generated against the S3 API endpoint
  // (https://<ACCOUNT_ID>.r2.cloudflarestorage.com) — never a custom domain.
  const presignClient = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return {
    name: "s3",
    supportsDirectUpload: true,
    async putObject({ key, body, contentType }: PutObjectInput) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async deleteObject(key: string) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
    getPublicUrl(key: string) {
      return `${config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    },
    async getSignedUrl(key: string, expiresInSeconds = 3600) {
      const command = new GetObjectCommand({ Bucket: config.bucket, Key: key });
      return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    },
    async getObjectBuffer(key: string) {
      const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      return streamToBuffer(result.Body);
    },
    async createPresignedPutUrl({ key, contentType, expiresInSeconds }) {
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: contentType,
      });
      // The SDK's presigner leaves `content-type` UNSIGNED by default.
      // Listing it in `signableHeaders` binds the signature to the exact
      // Content-Type, so a browser that sends a different one gets a 403
      // SignatureDoesNotMatch instead of silently storing something else.
      const url = await getSignedUrl(presignClient, command, {
        expiresIn: expiresInSeconds,
        signableHeaders: new Set(["content-type"]),
      });
      return { url, headers: { "Content-Type": contentType } };
    },
    async headObject(key: string) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
        return { size: result.ContentLength ?? 0, contentType: result.ContentType ?? null };
      } catch (error) {
        const info = error as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (info.name === "NotFound" || info.$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
    },
  };
}
