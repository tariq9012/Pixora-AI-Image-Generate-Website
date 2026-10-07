import { useEffect, useRef, useState } from "react";

import { createUploadIntentFn, finalizeUploadFn } from "@/lib/storage/direct-upload.functions";
import type { AssetPurpose } from "@/lib/storage/types";

export type UploadedAssetInfo = {
  id: string;
  url: string;
  mimeType: string;
  width: number;
  height: number;
  purpose: AssetPurpose;
};

export type UploadStatus = "idle" | "uploading" | "complete" | "error";

type UploadApiResponse =
  | { success: true; asset: UploadedAssetInfo }
  | { success: false; error: { code: string; message: string } };

class StorageUploadError extends Error {
  status: number | null;

  constructor(status: number | null) {
    super(status === null ? "network" : `http-${status}`);
    this.name = "StorageUploadError";
    this.status = status;
  }
}

/**
 * Direct browser -> R2 PUT with REAL progress (XMLHttpRequest is the only
 * browser API that reports upload progress; `fetch` cannot). The header set
 * is exactly what the server signed — Content-Type must match or R2 answers
 * 403 SignatureDoesNotMatch. The presigned URL is a bearer credential, so it
 * is never logged.
 */
function putToStorage(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (percent: number) => void,
  onRequest: (xhr: XMLHttpRequest) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    onRequest(xhr);
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new StorageUploadError(xhr.status));
    };
    // A blocked/failed cross-origin request (typically missing R2 CORS) ends
    // up here with no readable status.
    xhr.onerror = () => reject(new StorageUploadError(null));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    xhr.send(file);
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One hook, reused by every tool page's image input and the profile
 * avatar picker. Owns the instant local preview (`URL.createObjectURL`,
 * revoked whenever it's replaced or the component unmounts) and the upload.
 *
 * Two upload paths, chosen by the SERVER (createUploadIntentFn):
 *  - local dev storage  -> the original multipart POST /api/assets/upload;
 *  - S3/R2 (production) -> presigned PUT straight to R2, then finalize.
 * Either way the result is the same `asset` shape with a normal asset id, so
 * pages don't know or care which path ran.
 *
 * `progress` is a real 0-100 value during a direct upload and `null`
 * otherwise (the server-upload path can't report it; pages just show the
 * existing spinner).
 */
export function useAssetUpload(purpose: AssetPurpose) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [asset, setAsset] = useState<UploadedAssetInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  // Bumped by every new upload and by reset(): results from an older run are
  // ignored, so a cancelled/replaced upload can never flip the UI to "complete".
  const runIdRef = useRef(0);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      xhrRef.current?.abort();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function reset() {
    runIdRef.current += 1;
    xhrRef.current?.abort();
    xhrRef.current = null;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setStatus("idle");
    setPreview(null);
    setAsset(null);
    setError(null);
    setProgress(null);
  }

  async function upload(file: File) {
    runIdRef.current += 1;
    const runId = runIdRef.current;
    const isStale = () => runIdRef.current !== runId;

    xhrRef.current?.abort();
    setError(null);
    setAsset(null);
    setProgress(null);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setPreview(objectUrl);
    setStatus("uploading");

    const fail = (message: string) => {
      if (isStale()) return;
      setStatus("error");
      setProgress(null);
      setError(message);
    };

    try {
      const intent = await createUploadIntentFn({
        data: { purpose, filename: file.name, mimeType: file.type, size: file.size },
      });
      if (isStale()) return;

      if (!intent.success) {
        fail(intent.message);
        return;
      }

      // ---- Local development storage: original server upload, unchanged ----
      if (intent.mode === "server") {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("purpose", purpose);

        const response = await fetch("/api/assets/upload", { method: "POST", body: formData });
        const result = (await response.json()) as UploadApiResponse;
        if (isStale()) return;

        if (!result.success) {
          fail(result.error.message);
          return;
        }
        setAsset(result.asset);
        setStatus("complete");
        return;
      }

      // ---- S3/R2: authorize -> direct PUT -> finalize ----
      setProgress(0);
      try {
        await putToStorage(
          intent.uploadUrl,
          intent.headers,
          file,
          (percent) => {
            if (!isStale()) setProgress(percent);
          },
          (xhr) => {
            xhrRef.current = xhr;
          },
        );
      } catch (putError) {
        if (isStale() || (putError instanceof DOMException && putError.name === "AbortError")) {
          return;
        }
        const httpStatus = putError instanceof StorageUploadError ? putError.status : null;
        console.error("Direct upload failed", httpStatus === null ? "network/CORS" : httpStatus);
        fail(
          httpStatus === null
            ? "Couldn't reach file storage. Check your connection and try again."
            : "File storage rejected the upload. Please try again.",
        );
        return;
      } finally {
        xhrRef.current = null;
      }
      if (isStale()) return;

      // Finalize is idempotent server-side, so a transient failure (network,
      // DB, another request still finishing) is retried WITHOUT re-uploading.
      let lastMessage = "Upload failed. Please try again.";
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (attempt > 0) {
          await wait(600 * 2 ** (attempt - 1));
          if (isStale()) return;
        }
        try {
          const finalized = await finalizeUploadFn({ data: { intentId: intent.intentId } });
          if (isStale()) return;

          if (finalized.success) {
            setAsset(finalized.asset);
            setProgress(null);
            setStatus("complete");
            return;
          }
          lastMessage = finalized.message;
          if (!finalized.retryable) break;
        } catch (finalizeError) {
          console.error(finalizeError);
        }
      }
      fail(lastMessage);
    } catch (err) {
      console.error(err);
      fail("Upload failed. Please try again.");
    }
  }

  return { status, preview, asset, error, progress, upload, reset };
}
