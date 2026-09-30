import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { reportStatusEnum, reportTargetTypeEnum } from "./enums";
import { users } from "./users";

/**
 * `targetId` is intentionally a plain uuid with no foreign key: the target
 * can be a creation, a generation, or a user (see `targetType`), i.e. a
 * polymorphic reference. A single FK can't point at three different
 * tables, so the target is resolved in application code by `targetType`
 * instead of at the database constraint level.
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reporterUserId: uuid("reporter_user_id").references(() => users.id, { onDelete: "set null" }),
    targetType: reportTargetTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    status: reportStatusEnum("status").notNull().default("PENDING"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reporterUserIdIdx: index("reports_reporter_user_id_idx").on(table.reporterUserId),
    statusIdx: index("reports_status_idx").on(table.status),
    targetIdx: index("reports_target_type_target_id_idx").on(table.targetType, table.targetId),
  }),
);
