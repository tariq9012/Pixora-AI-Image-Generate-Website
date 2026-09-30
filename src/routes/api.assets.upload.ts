import { createFileRoute } from "@tanstack/react-router";

import { checkRateLimit } from "@/lib/auth/rate-limit.server";
import { env } from "@/lib/env.server";
import { isSameOriginRequest } from "@/lib/security/origin.server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookies.server";
import { validateSessionToken } from "@/lib/auth/session.server";
import { ASSET_PURPOSES, type AssetPurpose } from "@/lib/storage/types";
import { uploadAsset } from "@/lib/storage/storage.server";
import { FileValidationError } from "@/lib/storage/validation";

/**
 * This route reads the session cookie itself (parsing the raw `Cookie`
 * header from the Request) instead of importing
 * src/lib/auth/cookies.server.ts's `getCookie`-based helper. That helper
 * already works from `createServerFn`s (proven by every auth flow in
 * Phases 3–4) but its behavior inside a raw `server.handlers` route like
 * this one was not independently verified when this was written — and
 * getting authentication wrong on an upload endpoint is the worst place
 * to be optimistic. Parsing the header directly here has zero dependency
 * on that either way.
 */
function readSessionTokenFromRequest(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;

  const prefix = `${SESSION_COOKIE_NAME}=`;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!match) return undefined;

  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return undefined;
  }
}

function isAssetPurpose(value: FormDataEntryValue | null): value is AssetPurpose {
  return typeof value === "string" && (ASSET_PURPOSES as readonly string[]).includes(value);
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/assets/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // PHASE 14: CSRF / origin protection for this raw API route.
        if (!isSameOriginRequest(request)) {
          return jsonError(403, "FORBIDDEN", "Cross-origin requests are not allowed.");
        }

        const token = readSessionTokenFromRequest(request);
        if (!token) {
          return jsonError(401, "UNAUTHORIZED", "You must be logged in to upload files.");
        }

        const session = await validateSessionToken(token);
        if (!session) {
          return jsonError(401, "UNAUTHORIZED", "Your session has expired. Please log in again.");
        }
        if (session.user.status !== "ACTIVE") {
          return jsonError(403, "FORBIDDEN", "This account cannot perform this action.");
        }

        const rateLimit = checkRateLimit(`upload:${session.user.id}`, {
          max: 30,
          windowMs: 60 * 60 * 1000,
        });
        if (!rateLimit.allowed) {
          return jsonError(429, "RATE_LIMITED", "Too many uploads. Please try again later.");
        }

        // PHASE 14: bound the body BEFORE buffering it. On Vercel, bodies
        // above ~4.5 MB are rejected by the platform before this code runs,
        // so the production default stays below that; anything larger needs
        // the direct-to-R2 upload flow (docs/PRODUCTION.md). Elsewhere the
        // per-purpose limits in storage/validation.ts still apply.
        const HARD_BODY_CAP_BYTES = 21 * 1024 * 1024;
        const proxyCap =
          env.UPLOAD_PROXY_MAX_BYTES ??
          (env.NODE_ENV === "production" ? 4 * 1024 * 1024 : HARD_BODY_CAP_BYTES);
        const declaredLength = Number(request.headers.get("content-length") ?? "0");
        if (declaredLength > Math.min(proxyCap, HARD_BODY_CAP_BYTES) + 64 * 1024) {
          const capMb = Math.floor(Math.min(proxyCap, HARD_BODY_CAP_BYTES) / (1024 * 1024));
          return jsonError(
            413,
            "FILE_TOO_LARGE",
            `This file is too large to upload here. The current upload limit is ${capMb} MB.`,
          );
        }

        let formData: FormData;
        try {
          formData = await request.formData();
        } catch {
          return jsonError(400, "BAD_REQUEST", "Expected multipart form data.");
        }

        const file = formData.get("file");
        const purposeRaw = formData.get("purpose");

        if (!(file instanceof File)) {
          return jsonError(400, "BAD_REQUEST", "A file is required.");
        }
        if (!isAssetPurpose(purposeRaw)) {
          return jsonError(400, "BAD_REQUEST", "A valid upload purpose is required.");
        }

        if (file.size > Math.min(proxyCap, HARD_BODY_CAP_BYTES)) {
          const capMb = Math.floor(Math.min(proxyCap, HARD_BODY_CAP_BYTES) / (1024 * 1024));
          return jsonError(
            413,
            "FILE_TOO_LARGE",
            `This file is too large to upload here. The current upload limit is ${capMb} MB.`,
          );
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        try {
          const asset = await uploadAsset({
            userId: session.user.id,
            purpose: purposeRaw,
            buffer,
            declaredMimeType: file.type,
            originalFilename: file.name,
          });

          return new Response(JSON.stringify({ success: true, asset }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (error) {
          if (error instanceof FileValidationError) {
            return jsonError(400, error.code, error.message);
          }
          console.error("Asset upload failed:", error);
          return jsonError(500, "INTERNAL_ERROR", "Upload failed. Please try again.");
        }
      },
    },
  },
});
