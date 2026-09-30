import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { assetPurposeEnum } from "./enums";
import { users } from "./users";

/**
 * Generic pointer to a file in whatever storage backend is configured
 * (S3-compatible bucket, Cloudinary, etc.) — no provider is integrated
 * yet. `storageProvider` + `storageKey` let a future storage layer be
 * swapped in without changing this table's shape.
 */
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageProvider: text("storage_provider").notNull(),
    storageKey: text("storage_key").notNull(),
    url: text("url").notNull(),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    width: integer("width"),
    height: integer("height"),
    // Preserved as display-only metadata (e.g. for a future "download"
    // filename) — NEVER used to construct the storage key or path. See
    // src/lib/storage/paths.ts.
    originalFilename: text("original_filename"),
    // Default kept from Phase 2 so this migration doesn't have to touch the
    // column default at all — application code always passes an explicit
    // purpose, so the default is never actually relied on.
    purpose: assetPurposeEnum("purpose").notNull().default("OTHER"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("assets_user_id_idx").on(table.userId),
    purposeIdx: index("assets_purpose_idx").on(table.purpose),
  }),
);
