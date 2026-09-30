import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { userRoleEnum, userStatusEnum } from "./enums";
import { assets } from "./assets";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    name: text("name"),
    username: text("username"),
    avatarUrl: text("avatar_url"),
    // Which `assets` row `avatarUrl` currently points at, if any — lets us
    // safely delete the OLD avatar's storage object once a replacement
    // upload succeeds (see src/lib/storage/storage.server.ts). Set null
    // (not cascaded) if that asset is ever removed out from under it.
    // `users` <-> `assets` reference each other; annotating this one side breaks
    // the circular type inference (TS7022/TS7024). Type-only: the generated SQL
    // and migrations are unchanged.
    avatarAssetId: uuid("avatar_asset_id").references((): AnyPgColumn => assets.id, {
      onDelete: "set null",
    }),
    // Free-form "about me" text shown on the public profile page.
    bio: text("bio"),
    // Set while an email-change request is awaiting confirmation (see
    // src/lib/auth/actions.server.ts's requestEmailChange). `email` itself
    // is only overwritten once the new address is verified.
    pendingEmail: text("pending_email"),
    // Nullable: an account created purely via a future OAuth provider would
    // have no password of its own. Never selected out to the client — see
    // toSafeUser() in src/lib/auth/actions.server.ts.
    passwordHash: text("password_hash"),
    role: userRoleEnum("role").notNull().default("USER"),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    // PHASE 13 (billing): a user maps to at most one Stripe Customer,
    // created lazily on first checkout/portal request (see
    // billing/stripe.server.ts's getOrCreateStripeCustomer) — never
    // eagerly for Free-plan users (spec §28). Nullable + unique: most
    // users will never have one, and no two users may ever share one.
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => ({
    emailUniqueIdx: uniqueIndex("users_email_unique_idx").on(table.email),
    usernameUniqueIdx: uniqueIndex("users_username_unique_idx").on(table.username),
    statusIdx: index("users_status_idx").on(table.status),
    roleIdx: index("users_role_idx").on(table.role),
    stripeCustomerIdUniqueIdx: uniqueIndex("users_stripe_customer_id_unique_idx").on(
      table.stripeCustomerId,
    ),
  }),
);
