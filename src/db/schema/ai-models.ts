import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { aiModelStatusEnum, aiModelTypeEnum } from "./enums";

/**
 * One row per AI model/provider Pixora can generate with. No real provider
 * is wired up yet — this table just gives the rest of the app (and the
 * admin "Models" page) something real to read from instead of mock data.
 */
export const aiModels = pgTable(
  "ai_models",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    provider: text("provider").notNull(),
    providerModelId: text("provider_model_id"),
    type: aiModelTypeEnum("type").notNull(),
    status: aiModelStatusEnum("status").notNull().default("ACTIVE"),
    creditCost: integer("credit_cost").notNull().default(0),
    supportsTextToImage: boolean("supports_text_to_image").notNull().default(false),
    supportsImageToImage: boolean("supports_image_to_image").notNull().default(false),
    supportsUpscale: boolean("supports_upscale").notNull().default(false),
    supportsBackgroundRemoval: boolean("supports_background_removal").notNull().default(false),
    supportsOutpainting: boolean("supports_outpainting").notNull().default(false),
    // Free-form provider-specific settings (e.g. default steps/guidance).
    configuration: jsonb("configuration").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUniqueIdx: uniqueIndex("ai_models_slug_unique_idx").on(table.slug),
    statusIdx: index("ai_models_status_idx").on(table.status),
    typeIdx: index("ai_models_type_idx").on(table.type),
  }),
);
