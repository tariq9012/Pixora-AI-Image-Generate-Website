import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { assetPurposeEnum } from "./enums";
import { assets } from "./assets";
import { users } from "./users";

/**
 * PHASE 14A: server-issued authorization for ONE direct-to-R2 upload.
 *
 * Lifecycle: created by `createUploadIntent` (no object exists yet) ->
 * browser PUTs to the presigned URL -> `finalizeUploadIntent` validates the
 * uploaded bytes and creates the real `assets` row (`completed_at` +
 * `asset_id` set). Persistent on purpose: authorize and finalize can run on
 * different serverless instances, so this cannot live in process memory.
 *
 * The browser only ever learns `id`. It never supplies (and the server never
 * accepts) a bucket, key, user id or purpose at finalize time — everything
 * is read back from this row, scoped to the authenticated user.
 */
export const uploadIntents = pgTable(
  "upload_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: assetPurposeEnum("purpose").notNull(),
    // Quarantine/intake key (see buildPendingUploadKey). NOT the final asset key.
    storageKey: text("storage_key").notNull(),
    expectedMimeType: text("expected_mime_type").notNull(),
    // Declared by the browser; only a pre-signing sanity check. The real
    // object size (HeadObject) is authoritative at finalize.
    expectedSize: integer("expected_size").notNull(),
    // Display-only metadata, sanitized. Never used to build a key or header.
    originalFilename: text("original_filename"),
    // Finalize is only accepted before this moment (presigned URL lifetime
    // plus a short grace period for finalize retries).
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Set atomically by the single request that is currently finalizing;
    // makes double-clicks / retries create exactly one asset.
    finalizeClaimedAt: timestamp("finalize_claimed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    storageKeyUniqueIdx: uniqueIndex("upload_intents_storage_key_unique_idx").on(table.storageKey),
    userCreatedIdx: index("upload_intents_user_id_created_at_idx").on(table.userId, table.createdAt),
    expiresIdx: index("upload_intents_expires_at_idx").on(table.expiresAt),
  }),
);
