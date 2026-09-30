import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Coins, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pixora/app-shell";
import { StatusBadge } from "@/components/pixora/data-display";
import { Button } from "@/components/ui/button";
import {
  createBillingPortalFn,
  createCreditPackCheckoutFn,
  getBillingSummaryFn,
  listPaymentsFn,
} from "@/lib/billing/functions";
import { CREDIT_PACKS } from "@/lib/billing/credit-packs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/credits")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Credits — Pixora AI" },
      { name: "description", content: "Track your credit balance, plan and top-ups." },
      { property: "og:title", content: "Credits — Pixora AI" },
      { property: "og:description", content: "Balance, plan and credit packs." },
    ],
  }),
  component: CreditsPage,
});

/**
 * PHASE 13: real balance/plan/checkout/payment history, replacing the
 * previous fully-mock version (see billing/checkout.server.ts's audit
 * note — every button here used to be `toast.info("... next phase")`).
 * The old "Used this month / Generations / Avg per image / Rollover"
 * stat cards and "Recent usage" ledger list are intentionally NOT
 * rebuilt here — they were generation-usage stats that duplicate Phase
 * 12's real History page, not a billing concern; this page's real
 * replacement for that section is the actual `payments` table below.
 */

const PAYMENTS_PAGE_SIZE = 10;

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function CreditsPage() {
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [pendingPack, setPendingPack] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["billing-summary"],
    queryFn: () => getBillingSummaryFn(),
  });
  const paymentsQuery = useQuery({
    queryKey: ["payments", paymentsPage],
    queryFn: () => listPaymentsFn({ data: { page: paymentsPage, pageSize: PAYMENTS_PAGE_SIZE } }),
  });

  const buyPackMutation = useMutation({
    mutationFn: (packSlug: string) => createCreditPackCheckoutFn({ data: { packSlug } }),
    onMutate: (packSlug) => setPendingPack(packSlug),
    onSettled: () => setPendingPack(null),
    onSuccess: (result) => {
      if (result.success) {
        window.location.href = result.url;
        return;
      }
      toast.error(result.message);
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const portalMutation = useMutation({
    mutationFn: () => createBillingPortalFn(),
    onSuccess: (result) => {
      if (result.success) {
        window.location.href = result.url;
        return;
      }
      toast.error(result.message);
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const summary = summaryQuery.data;
  const stripeConfigured = summary?.stripeConfigured ?? false;
  const planLabel = summary?.subscription ? summary.subscription.planName : "Free";
  const renewalNote = (() => {
    const sub = summary?.subscription;
    if (!sub || !sub.currentPeriodEnd) return null;
    const date = new Date(sub.currentPeriodEnd).toLocaleDateString();
    if (sub.cancelAtPeriodEnd) return `Ends ${date}`;
    if (sub.status === "ACTIVE" || sub.status === "TRIALING") return `Renews ${date}`;
    return null;
  })();

  return (
    <AppShell title="Credits" description="Your balance, plan and top-up options.">
      <div className="space-y-6">
        <div className="surface-panel flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Available balance
            </p>
            <p className="mt-2 flex items-center gap-2 font-display text-4xl font-semibold text-foreground">
              <Coins className="size-7 text-primary" />
              {summaryQuery.isPending ? "—" : (summary?.balance ?? 0).toLocaleString()}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {planLabel} plan{renewalNote ? ` · ${renewalNote}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/pricing">Upgrade Plan</Link>
            </Button>
            {summary?.hasBillingPortal ? (
              <Button
                variant="outline"
                disabled={portalMutation.isPending}
                onClick={() => portalMutation.mutate()}
              >
                {portalMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Manage Billing
              </Button>
            ) : null}
          </div>
        </div>

        {!stripeConfigured && !summaryQuery.isPending ? (
          <div className="surface-panel border-warning/40 bg-warning/5 p-4 text-sm text-warning">
            Payments aren't configured on this server yet — credit packs and plan upgrades are
            unavailable.
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-3">
          {CREDIT_PACKS.map((p) => (
            <div key={p.slug} className="surface-panel p-6">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{p.note}</p>
              <p className="mt-2 font-display text-2xl font-semibold text-foreground">
                {p.credits.toLocaleString()} credits
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatMoney(p.priceCents, "usd")} one-time
              </p>
              <Button
                variant="outline"
                className="mt-4 w-full"
                disabled={!stripeConfigured || pendingPack === p.slug}
                onClick={() => buyPackMutation.mutate(p.slug)}
              >
                {pendingPack === p.slug ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Buy {p.credits.toLocaleString()}
              </Button>
            </div>
          ))}
        </div>

        <div className="surface-panel p-6">
          <h2 className="font-display text-base font-semibold text-foreground">Payment history</h2>
          {paymentsQuery.isPending ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
          ) : paymentsQuery.data && paymentsQuery.data.items.length > 0 ? (
            <>
              <ul className="mt-4 divide-y divide-border">
                {paymentsQuery.data.items.map((pmt) => (
                  <li key={pmt.id} className="flex items-center justify-between py-3.5">
                    <div>
                      <p className="text-sm text-foreground">{pmt.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(pmt.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge
                        status={
                          pmt.status === "SUCCEEDED"
                            ? "Paid"
                            : pmt.status === "PENDING"
                              ? "Pending"
                              : pmt.status === "REFUNDED"
                                ? "Refunded"
                                : "Failed"
                        }
                      />
                      <p className={cn("text-sm font-medium text-foreground")}>
                        {formatMoney(pmt.amountCents, pmt.currency)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              {paymentsQuery.data.total > PAYMENTS_PAGE_SIZE ? (
                <div className="mt-4 flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={paymentsPage <= 1}
                    onClick={() => setPaymentsPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">Page {paymentsPage}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!paymentsQuery.data.hasNext}
                    onClick={() => setPaymentsPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No payments yet.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
