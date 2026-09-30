import type { CreditPack } from "./types";

/**
 * PHASE 13 AUDIT NOTE + DESIGN DECISION (credit packs):
 *
 * The previous Credits page (`src/routes/credits.tsx`) rendered a
 * `PACKS` array of `{credits, price, note}` STRINGS ("500", "$5") purely
 * for display — "Buy Credits" and every "Buy {credits}" button only
 * called `toast.info(...)`. Nothing about pricing lived on the server.
 *
 * For Phase 13, this file becomes the actual authoritative source: the
 * server-side checkout creation (billing/checkout.server.ts) resolves a
 * pack SLUG the client sends into one of these entries and builds the
 * Stripe Checkout line item from `priceCents`/`credits` here — the
 * client never sends an amount or credit quantity (spec §13/§46).
 *
 * Per spec §15 ("Do not unnecessarily add a whole new table if safe
 * typed server configuration is sufficient for fixed packs"), this is a
 * small typed catalog rather than a database table: there are three
 * fixed packs, they don't need per-tenant/admin-editable pricing today,
 * and Stripe Checkout Sessions for one-time purchases can be created
 * with inline `price_data` (see checkout.server.ts) — no pre-created
 * Stripe Price object is required for this to be "real" billing. If
 * packs ever need admin-editable pricing without a redeploy, that's the
 * signal to promote this to a table (same shape as `plans`).
 *
 * Amounts mirror the previous mock UI's numbers exactly (500/$5,
 * 2,000/$18, 5,000/$40) since the task's own audit instructions say not
 * to invent new pricing without reason — only the "$5" string became a
 * real `priceCents: 500` integer.
 */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { slug: "starter", name: "Starter", credits: 500, priceCents: 500, note: "Starter top-up" },
  { slug: "growth", name: "Growth", credits: 2000, priceCents: 1800, note: "Most popular" },
  { slug: "power", name: "Power", credits: 5000, priceCents: 4000, note: "Best value" },
] as const;

export function findCreditPack(slug: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.slug === slug);
}
