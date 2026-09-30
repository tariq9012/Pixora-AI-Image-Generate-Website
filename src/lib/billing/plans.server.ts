import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { plans } from "@/db/schema";

import { isPlanSelfServe } from "./plan-pricing.server";
import type { PlanSummary } from "./types";

/**
 * PHASE 13 AUDIT NOTE (pricing page):
 *
 * `plans` (Phase 2) already had everything a pricing card needs —
 * `priceMonthlyCents`, `priceYearlyCents`, `monthlyCredits`, `features`,
 * `active` — the previous Pricing page just never read it, rendering
 * `PLANS` from `src/lib/mock-data.ts` instead. This is the real query;
 * `selfServeAvailable` is the ONE thing not in that table itself — it
 * comes from whether a Stripe Price ID is actually configured for this
 * plan (see plan-pricing.server.ts), so the UI can show "Contact us"
 * instead of a broken Checkout button for Enterprise (or for
 * Creator/Pro before Stripe Price IDs are ever configured).
 */
export async function listActivePlans(): Promise<PlanSummary[]> {
  const rows = await db
    .select()
    .from(plans)
    .where(eq(plans.active, true))
    .orderBy(asc(plans.priceMonthlyCents));

  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    priceMonthlyCents: p.priceMonthlyCents,
    priceYearlyCents: p.priceYearlyCents,
    monthlyCredits: p.monthlyCredits,
    features: p.features,
    selfServeAvailable: isPlanSelfServe(p.slug),
  }));
}
