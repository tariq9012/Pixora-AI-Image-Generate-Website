import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { AppShell } from "@/components/pixora/app-shell";
import { Button } from "@/components/ui/button";

/**
 * Spec §53: reached when the user cancels/abandons Stripe Checkout. The
 * Checkout Session itself is simply left in whatever state Stripe put it
 * in (typically "open", eventually "expired") — nothing here marks the
 * local payment PAID or grants any credits.
 */
export const Route = createFileRoute("/billing/cancel")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  head: () => ({
    meta: [{ title: "Checkout cancelled — Pixora AI" }],
  }),
  component: BillingCancel,
});

function BillingCancel() {
  return (
    <AppShell title="Checkout cancelled" description="No charge was made.">
      <div className="surface-panel mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
        <XCircle className="size-12 text-muted-foreground" />
        <h1 className="font-display text-xl font-semibold text-foreground">Checkout cancelled</h1>
        <p className="text-sm text-muted-foreground">
          You weren't charged. You can try again any time from Credits or Pricing.
        </p>
        <div className="mt-2 flex gap-2">
          <Button asChild variant="outline">
            <Link to="/pricing">View Pricing</Link>
          </Button>
          <Button asChild>
            <Link to="/credits">Back to Credits</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
