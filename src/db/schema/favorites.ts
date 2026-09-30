import { index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { creations } from "./creations";
import { users } from "./users";

/**
 * Design decision (see task spec §11): favorites are a normalized
 * many-to-many join table, NOT a boolean column on `creations`.
 *
 * Why: Pixora's Explore page lets any user favorite/save creations that
 * belong to *other* users, not just their own. A boolean on `creations`
 * can only ever represent "the owner favorited their own thing" — it
 * can't represent "50 different users each favorited this one public
 * creation" without duplicating the creation row per user. A join table
 * models that correctly, keeps `creations` free of per-viewer state, and
 * makes "my favorites" / "favorite count" both cheap, indexed queries.
 */
export const favorites = pgTable(
  "favorites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creationId: uuid("creation_id")
      .notNull()
      .references(() => creations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userCreationUniqueIdx: uniqueIndex("favorites_user_creation_unique_idx").on(
      table.userId,
      table.creationId,
    ),
    userIdIdx: index("favorites_user_id_idx").on(table.userId),
    creationIdIdx: index("favorites_creation_id_idx").on(table.creationId),
  }),
);
