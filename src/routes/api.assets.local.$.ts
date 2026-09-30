import { createFileRoute } from "@tanstack/react-router";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, sep } from "node:path";

import { env } from "@/lib/env.server";
import { LOCAL_STORAGE_ROOT } from "@/lib/storage/providers/local.server";

/**
 * Serves files written by the local dev storage fallback
 * (src/lib/storage/providers/local.server.ts). Only reachable at all when
 * STORAGE_PROVIDER=local; in production (which env.server.ts's
 * superRefine already forces to STORAGE_PROVIDER=s3) this always 404s.
 *
 * NOTE ON UNCERTAINTY: this is a splat/catch-all route
 * (`api.assets.local.$.ts` → `/api/assets/local/*`). The exact name
 * TanStack Router exposes the captured wildcard segment under
 * (`params._splat` below) could not be verified against real type
 * definitions in the environment that wrote this (no network access). If
 * uploaded-image previews don't load in local dev, this is the file to
 * check first — everything upstream of it (upload, validation, the
 * `assets` DB row) is independently correct regardless.
 */
export const Route = createFileRoute("/api/assets/local/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (env.STORAGE_PROVIDER !== "local") {
          return new Response("Not found", { status: 404 });
        }

        const requestedPath = (params as Record<string, string | undefined>)["_splat"];

        if (!requestedPath || requestedPath.includes("..") || requestedPath.includes("\0")) {
          return new Response("Not found", { status: 404 });
        }

        const root = normalize(LOCAL_STORAGE_ROOT);
        const absolutePath = normalize(join(root, requestedPath));

        // Belt-and-suspenders path-traversal guard on top of the ".."
        // check above: the resolved path must still be inside the root.
        if (absolutePath !== root && !absolutePath.startsWith(root + sep)) {
          return new Response("Not found", { status: 404 });
        }

        try {
          const stats = await stat(absolutePath);
          if (!stats.isFile()) {
            return new Response("Not found", { status: 404 });
          }

          const data = await readFile(absolutePath);
          return new Response(data, {
            status: 200,
            headers: {
              "content-type": contentTypeFor(absolutePath),
              "cache-control": "private, max-age=3600",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});

function contentTypeFor(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}
