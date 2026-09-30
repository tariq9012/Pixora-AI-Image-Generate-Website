import { relations } from "drizzle-orm";

import { accounts } from "./accounts";
import { aiModels } from "./ai-models";
import { assets } from "./assets";
import { auditLogs } from "./audit-logs";
import { creations } from "./creations";
import { creditBalances, creditTransactions } from "./credits";
import { favorites } from "./favorites";
import { generations } from "./generations";
import { payments } from "./payments";
import { plans } from "./plans";
import { projects } from "./projects";
import { reports } from "./reports";
import { sessions } from "./sessions";
import { subscriptions } from "./subscriptions";
import { users } from "./users";
import { verificationTokens } from "./verification-tokens";

export const usersRelations = relations(users, ({ many, one }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  verificationTokens: many(verificationTokens),
  projects: many(projects),
  generations: many(generations),
  creations: many(creations),
  favorites: many(favorites),
  creditBalance: one(creditBalances, {
    fields: [users.id],
    references: [creditBalances.userId],
  }),
  creditTransactions: many(creditTransactions),
  subscriptions: many(subscriptions),
  payments: many(payments),
  assets: many(assets),
  auditLogs: many(auditLogs),
  reportsFiled: many(reports, { relationName: "reportsAsReporter" }),
  reportsReviewed: many(reports, { relationName: "reportsAsReviewer" }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const verificationTokensRelations = relations(verificationTokens, ({ one }) => ({
  user: one(users, { fields: [verificationTokens.userId], references: [users.id] }),
}));

export const aiModelsRelations = relations(aiModels, ({ many }) => ({
  generations: many(generations),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  creations: many(creations),
}));

export const generationsRelations = relations(generations, ({ one, many }) => ({
  user: one(users, { fields: [generations.userId], references: [users.id] }),
  model: one(aiModels, { fields: [generations.modelId], references: [aiModels.id] }),
  creations: many(creations),
  creditTransactions: many(creditTransactions),
}));

export const creationsRelations = relations(creations, ({ one, many }) => ({
  user: one(users, { fields: [creations.userId], references: [users.id] }),
  generation: one(generations, {
    fields: [creations.generationId],
    references: [generations.id],
  }),
  project: one(projects, { fields: [creations.projectId], references: [projects.id] }),
  favorites: many(favorites),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
  creation: one(creations, { fields: [favorites.creationId], references: [creations.id] }),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  user: one(users, { fields: [payments.userId], references: [users.id] }),
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
  creditTransactions: many(creditTransactions),
}));

export const creditBalancesRelations = relations(creditBalances, ({ one }) => ({
  user: one(users, { fields: [creditBalances.userId], references: [users.id] }),
}));

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  user: one(users, { fields: [creditTransactions.userId], references: [users.id] }),
  generation: one(generations, {
    fields: [creditTransactions.generationId],
    references: [generations.id],
  }),
  payment: one(payments, {
    fields: [creditTransactions.paymentId],
    references: [payments.id],
  }),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  user: one(users, { fields: [assets.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  reporter: one(users, {
    fields: [reports.reporterUserId],
    references: [users.id],
    relationName: "reportsAsReporter",
  }),
  reviewer: one(users, {
    fields: [reports.reviewedBy],
    references: [users.id],
    relationName: "reportsAsReviewer",
  }),
}));
