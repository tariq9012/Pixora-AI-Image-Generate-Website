import { requireAdminUser } from "@/lib/auth/route-guards";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminShell } from "@/components/pixora/admin-shell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/logs")({
  beforeLoad: ({ context, location }) => {
    requireAdminUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Admin Logs — Pixora Admin" },
      { name: "description", content: "Audit trail of every administrative action." },
      { property: "og:title", content: "Admin Logs — Pixora Admin" },
      { property: "og:description", content: "Who did what, and when." },
    ],
  }),
  component: AdminLogs,
});

const LOGS = [
  { time: "14:42", actor: "@moderator.kim", action: "Removed image rp_311", level: "Warning" },
  {
    time: "14:20",
    actor: "@admin.sara",
    action: "Granted 2,000 credits to amara@northwind.co",
    level: "Info",
  },
  {
    time: "13:58",
    actor: "system",
    action: "Model Pixora Pro autoscaled to 24 workers",
    level: "Info",
  },
  { time: "13:31", actor: "@admin.raj", action: "Suspended user @spamforge", level: "Critical" },
  { time: "12:47", actor: "@admin.sara", action: "Updated Creator plan pricing", level: "Info" },
  {
    time: "11:12",
    actor: "system",
    action: "Failed generation spike detected (+18%)",
    level: "Warning",
  },
  { time: "09:04", actor: "@admin.kim", action: "Exported Q3 revenue report", level: "Info" },
];

const LEVEL_STYLE: Record<string, string> = {
  Info: "border-border text-muted-foreground",
  Warning: "border-warning/40 bg-warning/10 text-warning",
  Critical: "border-destructive/40 bg-destructive/10 text-destructive",
};

function AdminLogs() {
  const [query, setQuery] = useState("");
  const rows = LOGS.filter(
    (l) =>
      !query ||
      l.action.toLowerCase().includes(query.toLowerCase()) ||
      l.actor.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <AdminShell title="Admin Logs" description="Audit trail for the last 24 hours.">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search actions or admins..."
        className="mb-5 sm:max-w-sm"
      />
      <ol className="surface-panel divide-y divide-border px-5">
        {rows.map((l) => (
          <li key={`${l.time}-${l.action}`} className="flex flex-wrap items-center gap-3 py-4">
            <span className="font-mono text-xs text-muted-foreground">{l.time}</span>
            <Badge variant="outline" className={cn("font-medium", LEVEL_STYLE[l.level])}>
              {l.level}
            </Badge>
            <span className="text-sm text-foreground">{l.action}</span>
            <span className="ml-auto text-xs text-muted-foreground">{l.actor}</span>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="py-10 text-center text-sm text-muted-foreground">No matching entries.</li>
        ) : null}
      </ol>
    </AdminShell>
  );
}
