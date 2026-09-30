import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { verificationTokenPurposeEnum } from "./enums";
import { users } from "./users";

/**
 * Backs both email verification and password reset flows.
 * Only a hash of the token is stored — the raw token is emailed to the user
 * and never persisted, so a database read alone can't be used to complete
 * either flow.
 */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    purpose: verificationTokenPurposeEnum("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashUniqueIdx: uniqueIndex("verification_tokens_token_hash_unique_idx").on(
      table.tokenHash,
    ),
    userIdIdx: index("verification_tokens_user_id_idx").on(table.userId),
    purposeIdx: index("verification_tokens_purpose_idx").on(table.purpose),
  }),
);
