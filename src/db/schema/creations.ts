import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { generations } from "./generations";
import { projects } from "./projects";
import { users } from "./users";

/**
 * A saved, user-facing asset. Deliberately separate from `generations`:
 * a generation is a job (which can fail, retry, or produce nothing worth
 * keeping); a creation is the thing that actually shows up in the user's
 * gallery/history/project. Not every generation becomes a creation.
 *
 * `isFavorite` intentionally does NOT live on this table — see
 * `favorites.ts` for why favoriting is modeled as its own join table.
 */
export const creations = pgTable(
  "creations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    generationId: uuid("generation_id").references(() => generations.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title"),
    imageUrl: text("image_url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    mimeType: text("mime_type"),
    width: integer("width"),
    height: integer("height"),
    fileSize: integer("file_size"),
    // Soft delete: never hard-delete a user's asset as a side effect of
    // another action. A real cleanup job (later phase) can hard-delete
    // rows that have been soft-deleted past a retention window.
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("creations_user_id_idx").on(table.userId),
    projectIdIdx: index("creations_project_id_idx").on(table.projectId),
    generationIdIdx: index("creations_generation_id_idx").on(table.generationId),
    isDeletedIdx: index("creations_is_deleted_idx").on(table.isDeleted),
    createdAtIdx: index("creations_created_at_idx").on(table.createdAt),
  }),
);
