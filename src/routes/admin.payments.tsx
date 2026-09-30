import { requireAdminUser } from "@/lib/auth/route-guards";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminShell } from "@/components/pixora/admin-shell";
import { StatCard, StatusBadge } from "@/components/pixora/data-display";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ADMIN_TRANSACTIONS } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/payments")({
  beforeLoad: ({ context, location }) => {
    requireAdminUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Payments — Pixora Admin" },
      { name: "description", content: "Subscriptions, credit purchases and refunds." },
      { property: "og:title", content: "Payments — Pixora Admin" },
      { property: "og:description", content: "Revenue and transaction history." },
    ],
  }),
  component: AdminPayments,
});

function AdminPayments() {
  return (
    <AdminShell title="Payments" description="Revenue, subscriptions and refunds.">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="MRR" value="$284,120" delta="+7.6%" />
        <StatCard label="Active subscriptions" value="9,481" delta="+2.9%" />
        <StatCard label="Credit purchases" value="$46,210" delta="+11.2%" />
        <StatCard label="Refunds" value="$1,840" delta="-0.8%" positive={false} />
      </div>

      <div className="surface-panel mt-6 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transaction</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {ADMIN_TRANSACTIONS.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">{t.id}</TableCell>
                <TableCell>{t.user}</TableCell>
                <TableCell>{t.type}</TableCell>
                <TableCell>{t.plan}</TableCell>
                <TableCell className="text-right">{t.amount}</TableCell>
                <TableCell>
                  <StatusBadge status={t.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{t.date}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => toast.info("Invoice preview")}>
                    Invoice
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}
