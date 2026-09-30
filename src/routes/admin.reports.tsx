import { requireAdminUser } from "@/lib/auth/route-guards";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/pixora/admin-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/reports")({
  beforeLoad: ({ context, location }) => {
    requireAdminUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Reports — Pixora Admin" },
      { name: "description", content: "Scheduled and exported platform reports." },
      { property: "og:title", content: "Reports — Pixora Admin" },
      { property: "og:description", content: "Download usage, revenue and safety reports." },
    ],
  }),
  component: AdminReports,
});

const REPORTS = [
  { name: "Monthly usage summary", period: "September 2026", size: "1.2 MB", status: "Ready" },
  { name: "Revenue breakdown", period: "Q3 2026", size: "820 KB", status: "Ready" },
  { name: "Content safety report", period: "September 2026", size: "410 KB", status: "Ready" },
  { name: "Model performance", period: "Last 30 days", size: "2.4 MB", status: "Generating" },
  { name: "Churn analysis", period: "Q3 2026", size: "640 KB", status: "Ready" },
];

function AdminReports() {
  return (
    <AdminShell
      title="Reports"
      description="Exports for finance, ops and trust & safety."
      actions={
        <Button onClick={() => toast.success("Report queued")}>
          <FileText className="size-4" /> Generate report
        </Button>
      }
    >
      <div className="surface-panel overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {REPORTS.map((r) => (
              <TableRow key={r.name}>
                <TableCell className="text-foreground">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.period}</TableCell>
                <TableCell className="text-muted-foreground">{r.size}</TableCell>
                <TableCell>
                  <Badge variant="outline">{r.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={r.status !== "Ready"}
                    onClick={() => toast.success("Download started")}
                  >
                    <Download className="size-4" /> Download
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
