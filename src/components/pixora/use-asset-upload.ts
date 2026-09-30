import { useEffect, useRef, useState } from "react";

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

/**
 * One hook, reused by every tool page's image input and the profile
 * avatar picker (see src/lib/storage's own doc comments for the
 * server-side half). Owns: the instant local preview (via
 * `URL.createObjectURL`, revoked whenever it's replaced or the component
 * unmounts), the actual upload to `POST /api/assets/upload`, and the
 * resulting persisted asset.
 *
 * `preview` starts out as a blob URL and stays that way for the lifetime
 * of the component — callers needing the durable URL after a page reload
 * should use `asset.url`, not `preview`.
 */
export function useAssetUpload(purpose: AssetPurpose) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [asset, setAsset] = useState<UploadedAssetInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function reset() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setStatus("idle");
    setPreview(null);
    setAsset(null);
    setError(null);
  }

  async function upload(file: File) {
    setError(null);
    setAsset(null);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setPreview(objectUrl);
    setStatus("uploading");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("purpose", purpose);

      const response = await fetch("/api/assets/upload", { method: "POST", body: formData });
      const result = (await response.json()) as UploadApiResponse;

      if (!result.success) {
        setStatus("error");
        setError(result.error.message);
        return;
      }

      setAsset(result.asset);
      setStatus("complete");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError("Upload failed. Please try again.");
    }
  }

  return { status, preview, asset, error, upload, reset };
}
