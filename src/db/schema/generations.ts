import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { aiModels } from "./ai-models";
import { generationStatusEnum, generationTypeEnum } from "./enums";
import { users } from "./users";

/**
 * One row per async AI job (queued/processing/completed/failed/cancelled).
 * This is the source of truth for generation state; `creations` below
 * represents the final saved asset(s) that come out of a completed job.
 */
export const generations = pgTable(
  "generations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Nullable + set-null on delete: retiring a model definition must never
    // wipe out the historical record of jobs that used it.
    modelId: uuid("model_id").references(() => aiModels.id, { onDelete: "set null" }),
    type: generationTypeEnum("type").notNull(),
    status: generationStatusEnum("status").notNull().default("QUEUED"),
    progress: integer("progress").notNull().default(0),
    prompt: text("prompt"),
    negativePrompt: text("negative_prompt"),
    width: integer("width"),
    height: integer("height"),
    aspectRatio: text("aspect_ratio"),
    seed: text("seed"),
    inputImageUrl: text("input_image_url"),
    outputImageUrl: text("output_image_url"),
    thumbnailUrl: text("thumbnail_url"),
    providerJobId: text("provider_job_id"),
    providerMetadata: jsonb("provider_metadata").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    creditsUsed: integer("credits_used").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("generations_user_id_idx").on(table.userId),
    modelIdIdx: index("generations_model_id_idx").on(table.modelId),
    statusIdx: index("generations_status_idx").on(table.status),
    typeIdx: index("generations_type_idx").on(table.type),
    createdAtIdx: index("generations_created_at_idx").on(table.createdAt),
    providerJobIdIdx: index("generations_provider_job_id_idx").on(table.providerJobId),
  }),
);
