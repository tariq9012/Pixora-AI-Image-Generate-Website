import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import { env } from "@/lib/env.server";

/**
 * Shared by every local (no-billing) ONNX processor — first extracted
 * here in Phase 9 from Phase 8's background-removal.server.ts, which had
 * this exact download/cache/verify logic inline. Centralizing it means a
 * future local tool (Outpaint, Editor) gets atomic-download + checksum
 * verification + a shared singleton-session pattern for free, instead of
 * re-copying it a third time.
 */

export function localModelCacheDir(): string {
  return process.env["LOCAL_MODEL_CACHE_DIR"] || path.join(process.cwd(), ".cache", "models");
}

async function fileMd5(filePath: string): Promise<string> {
  const hash = createHash("md5");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export type ModelSpec = {
  /** Absolute download URL. */
  url: string;
  /** File name inside the shared cache directory. */
  filename: string;
  /** Known-good MD5, from the model's own publisher/distributor — never
   * invented. Used only as a corruption/integrity check, same purpose the
   * upstream project itself uses it for. Leave empty ("") when the
   * publisher only provides a different digest (e.g. SHA256) — the
   * caller is then responsible for verifying that separately after
   * `ensureLocalModel` resolves (see upscale.server.ts for an example);
   * this function skips its own MD5 check in that case rather than
   * comparing against a fabricated value. */
  md5: string;
  minBytes: number;
  maxBytes: number;
};

function modelPath(spec: ModelSpec): string {
  return path.join(localModelCacheDir(), spec.filename);
}

/**
 * Downloads to a `.part` file and atomically renames it into place only
 * once fully written, size-sane, and MD5-verified — so a crash or failed
 * download mid-write can never leave a corrupt file at the real path for
 * the next request to pick up.
 */
async function downloadModel(spec: ModelSpec, downloadTimeoutMs: number): Promise<void> {
  const dir = localModelCacheDir();
  await mkdir(dir, { recursive: true });
  const finalPath = modelPath(spec);
  const partPath = `${finalPath}.part`;

  console.log(`Downloading ${spec.filename} from ${spec.url} ...`);
  const startedAt = Date.now();

  const response = await withTimeout(fetch(spec.url), downloadTimeoutMs, "Model download");
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${spec.filename}: HTTP ${response.status}`);
  }
  const expectedBytes = Number(response.headers.get("content-length") ?? "0");
  console.log(
    `${spec.filename}: HTTP ${response.status}, content-length=` +
      (expectedBytes ? `${(expectedBytes / 1024 / 1024).toFixed(1)} MB` : "unknown"),
  );

  // Logs progress every 10s so a slow (but working) download is visibly
  // different from a hung one in the terminal, instead of just silently
  // waiting up to the full timeout with no feedback either way.
  let lastLoggedBytes = 0;
  let receivedBytes = 0;
  const progressTimer = setInterval(() => {
    if (receivedBytes === lastLoggedBytes) return; // no progress since last tick
    lastLoggedBytes = receivedBytes;
    const pct = expectedBytes ? ` (${((receivedBytes / expectedBytes) * 100).toFixed(0)}%)` : "";
    console.log(
      `${spec.filename}: ${(receivedBytes / 1024 / 1024).toFixed(1)} MB downloaded${pct}`,
    );
  }, 10_000);

  const nodeStream = Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>);
  nodeStream.on("data", (chunk: Buffer) => {
    receivedBytes += chunk.length;
  });

  try {
    await withTimeout(
      pipeline(nodeStream, createWriteStream(partPath)),
      downloadTimeoutMs,
      "Model download",
    );
  } finally {
    clearInterval(progressTimer);
  }

  console.log(
    `${spec.filename}: download finished, ${(receivedBytes / 1024 / 1024).toFixed(1)} MB in ` +
      `${((Date.now() - startedAt) / 1000).toFixed(0)}s`,
  );

  const { size } = await stat(partPath);
  if (size < spec.minBytes || size > spec.maxBytes) {
    await rm(partPath, { force: true });
    throw new Error(`Downloaded ${spec.filename} has an unexpected size (${size} bytes).`);
  }

  const md5 = await fileMd5(partPath);
  if (spec.md5 && md5 !== spec.md5) {
    await rm(partPath, { force: true });
    throw new Error(`Downloaded ${spec.filename} failed checksum verification (got ${md5}).`);
  }

  await rename(partPath, finalPath);
}

/**
 * Ensures `spec`'s model file is present and valid in the shared cache,
 * downloading it if missing (or if the cached copy's size looks wrong),
 * then returns its absolute path — ready to hand to
 * `ort.InferenceSession.create()`.
 */
export async function ensureLocalModel(
  spec: ModelSpec,
  downloadTimeoutMs: number,
): Promise<string> {
  const target = modelPath(spec);
  let needsDownload = true;
  try {
    const { size } = await stat(target);
    needsDownload = size < spec.minBytes || size > spec.maxBytes;
  } catch {
    needsDownload = true;
  }

  if (needsDownload) {
    await downloadModel(spec, downloadTimeoutMs);
  }

  return target;
}

/**
 * onnxruntime-node only ships prebuilt binaries for these three OSes —
 * used as a cheap, synchronous pre-reservation availability check so an
 * unsupported platform never charges credits before failing.
 */
export function isLocalOnnxSupportedPlatform(): boolean {
  if (!isLocalOnnxEnabled()) return false;
  const supportedPlatforms = new Set(["win32", "darwin", "linux"]);
  return supportedPlatforms.has(process.platform);
}

/**
 * PHASE 14: honest capability flag. Local ONNX inference is enabled by
 * default in development and DISABLED by default in production, because
 * the serverless target (Vercel) cannot support it: read-only project
 * filesystem (model cache), runtime model download from GitHub, large
 * native binaries, high memory/CPU per request. Set
 * LOCAL_ONNX_ENABLED=true only on infrastructure that really runs them
 * (persistent Node/container/VPS with a writable LOCAL_MODEL_CACHE_DIR).
 * When false, the tools report "unavailable" BEFORE any credits are
 * reserved, and the model lists shown in the UI are empty.
 */
export function isLocalOnnxEnabled(): boolean {
  if (env.LOCAL_ONNX_ENABLED === "true") return true;
  if (env.LOCAL_ONNX_ENABLED === "false") return false;
  return env.NODE_ENV !== "production";
}
