import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/pixora/app-shell";
import { Button } from "@/components/ui/button";

/**
 * PHASE 13 spec §18/§52: this page NEVER grants credits or marks
 * anything paid — it only revalidates whatever the client already has
 * cached (credit balance, billing summary, payment history) so that once
 * the webhook lands (which may be a moment before or after this redirect
 * happens), the Credits page shows the real, up-to-date state instead of
 * a stale cached one. A user could refresh or revisit this exact URL as
 * many times as they want; it has no side effect either way.
 */
export const Route = createFileRoute("/billing/success")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  validateSearch: z.object({ session_id: z.string().optional() }),
  head: () => ({
    meta: [{ title: "Payment received — Pixora AI" }],
  }),
  component: BillingSuccess,
});

function BillingSuccess() {
  const queryClient = useQueryClient();

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["credit-balance"] });
    void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["payments"] });
  }, [queryClient]);

  return (
    <AppShell title="Payment received" description="Thanks — we're finishing up.">
      <div className="surface-panel mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
        <CheckCircle2 className="size-12 text-success" />
        <h1 className="font-display text-xl font-semibold text-foreground">Payment received</h1>
        <p className="text-sm text-muted-foreground">
          Stripe is confirming your payment now. Your credits or plan will appear on your account
          within a few seconds — no need to do anything else.
        </p>
        <Button asChild className="mt-2">
          <Link to="/credits">Go to Credits</Link>
        </Button>
      </div>
    </AppShell>
  );
}
