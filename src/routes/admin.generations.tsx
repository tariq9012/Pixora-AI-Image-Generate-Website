import { requireAdminUser } from "@/lib/auth/route-guards";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/pixora/admin-shell";
import { StatusBadge } from "@/components/pixora/data-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ADMIN_GENERATIONS } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/generations")({
  beforeLoad: ({ context, location }) => {
    requireAdminUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Generations — Pixora Admin" },
      { name: "description", content: "Monitor every generation job across the platform." },
      { property: "og:title", content: "Generations — Pixora Admin" },
      { property: "og:description", content: "Job monitoring for Pixora generations." },
    ],
  }),
  component: AdminGenerations,
});

function AdminGenerations() {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () =>
      ADMIN_GENERATIONS.filter(
        (g) =>
          (status === "all" || g.status === status) &&
          (!query ||
            g.prompt.toLowerCase().includes(query.toLowerCase()) ||
            g.user.includes(query)),
      ),
    [status, query],
  );

  return (
    <AdminShell title="Generations" description="Live job queue and recent activity.">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search prompt or user..."
          className="sm:max-w-xs"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Queued">Queued</SelectItem>
            <SelectItem value="Processing">Processing</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="surface-panel overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Prompt</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Credits</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-mono text-xs">{g.id}</TableCell>
                <TableCell>{g.user}</TableCell>
                <TableCell>{g.model}</TableCell>
                <TableCell className="max-w-[260px] truncate">{g.prompt}</TableCell>
                <TableCell>
                  <StatusBadge status={g.status} />
                </TableCell>
                <TableCell className="text-right">{g.credits}</TableCell>
                <TableCell className="text-muted-foreground">{g.created}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toast.info(`Inspecting ${g.id}`)}
                  >
                    Inspect
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No generations match those filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}
