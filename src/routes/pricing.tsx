import { createFileRoute, Link, useRouteContext, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PublicShell } from "@/components/pixora/public-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { createSubscriptionCheckoutFn, listActivePlansFn } from "@/lib/billing/functions";
import { FAQS } from "@/lib/mock-data";
import type { PlanSummary } from "@/lib/billing/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Pixora AI" },
      {
        name: "description",
        content:
          "Simple pricing for AI image generation. Start free, then scale to Creator, Pro or Enterprise.",
      },
      { property: "og:title", content: "Pricing — Pixora AI" },
      { property: "og:description", content: "Start free, then scale as your output grows." },
    ],
  }),
  component: Pricing,
});

/**
 * PHASE 13: real plan data from the `plans` table (via listActivePlansFn)
 * and a real Checkout action for logged-in users — see
 * billing/plans.server.ts's audit note. Design/layout unchanged.
 */

const PLAN_COPY: Record<string, { cta: string; highlight?: boolean }> = {
  free: { cta: "Get started" },
  creator: { cta: "Subscribe", highlight: true },
  pro: { cta: "Subscribe" },
  enterprise: { cta: "Contact sales" },
};

function Pricing() {
  const router = useRouter();
  const { user } = useRouteContext({ from: "__root__" });
  const [yearly, setYearly] = useState(false);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  const plansQuery = useQuery({ queryKey: ["plans"], queryFn: () => listActivePlansFn() });

  const checkoutMutation = useMutation({
    mutationFn: (input: { planSlug: string; interval: "MONTHLY" | "YEARLY" }) =>
      createSubscriptionCheckoutFn({ data: input }),
    onMutate: (input) => setPendingSlug(input.planSlug),
    onSettled: () => setPendingSlug(null),
    onSuccess: (result) => {
      if (result.success) {
        window.location.href = result.url;
        return;
      }
      toast.error(result.message);
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  function handlePlanClick(plan: PlanSummary) {
    if (plan.slug === "free") {
      void router.navigate({ to: "/signup" });
      return;
    }
    if (plan.slug === "enterprise") {
      window.location.href = "mailto:sales@pixora.ai?subject=Enterprise%20plan";
      return;
    }
    if (!user) {
      void router.navigate({ to: "/signup" });
      return;
    }
    if (!plan.selfServeAvailable) {
      toast.info("This plan isn't available for self-serve checkout yet.");
      return;
    }
    checkoutMutation.mutate({ planSlug: plan.slug, interval: yearly ? "YEARLY" : "MONTHLY" });
  }

  const plans = plansQuery.data ?? [];

  return (
    <PublicShell>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 hero-glow" />
        <div className="relative mx-auto w-full max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h1 className="font-display text-4xl font-semibold text-foreground sm:text-5xl">
            Pricing that grows with your work
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Every plan includes the full studio. Only credits, resolution and speed change.
          </p>

          <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setYearly(false)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm transition-colors",
                !yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setYearly(true)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-colors",
                yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              Yearly
              <span className="text-xs opacity-80">−17%</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => {
            const copy = PLAN_COPY[p.slug] ?? { cta: "Choose plan" };
            const isFree = p.priceMonthlyCents === 0 && p.slug !== "enterprise";
            const isCustom = p.slug === "enterprise";
            return (
              <div
                key={p.id}
                className={cn(
                  "surface-panel relative flex flex-col p-6",
                  copy.highlight && "border-primary/50 shadow-glow",
                )}
              >
                {copy.highlight ? (
                  <Badge className="absolute -top-3 left-6">Most popular</Badge>
                ) : null}
                <h2 className="font-display text-lg font-semibold text-foreground">{p.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                <p className="mt-5 font-display text-4xl font-semibold text-foreground">
                  {isCustom
                    ? "Custom"
                    : isFree
                      ? "$0"
                      : yearly
                        ? `$${Math.round(p.priceYearlyCents / 12 / 100)}`
                        : `$${(p.priceMonthlyCents / 100).toFixed(0)}`}
                  {!isCustom ? (
                    <span className="text-sm font-normal text-muted-foreground">/month</span>
                  ) : null}
                </p>
                {!isCustom && !isFree && yearly ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    ${(p.priceYearlyCents / 100).toFixed(0)} billed yearly
                  </p>
                ) : null}
                <ul className="mt-6 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={copy.highlight ? "default" : "outline"}
                  className="mt-6 w-full"
                  disabled={pendingSlug === p.slug}
                  onClick={() => handlePlanClick(p)}
                >
                  {pendingSlug === p.slug ? <Loader2 className="size-4 animate-spin" /> : null}
                  {copy.cta}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-20">
          <h2 className="font-display text-2xl font-semibold text-foreground">Billing questions</h2>
          <Accordion type="single" collapsible className="mt-6 max-w-3xl">
            {FAQS.slice(0, 4).map((f) => (
              <AccordionItem key={f.q} value={f.q} className="border-border">
                <AccordionTrigger className="text-left text-base text-foreground">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </PublicShell>
  );
}
