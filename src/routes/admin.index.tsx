import { requireAdminUser } from "@/lib/auth/route-guards";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminShell } from "@/components/pixora/admin-shell";
import { ChartCard, StatCard, StatusBadge } from "@/components/pixora/data-display";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ADMIN_GENERATIONS, ADMIN_STATS, DAILY_GENERATIONS, REVENUE_SERIES } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/")({
  beforeLoad: ({ context, location }) => {
    requireAdminUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Admin Overview — Pixora AI" },
      { name: "description", content: "Platform health, usage and revenue at a glance." },
      { property: "og:title", content: "Admin Overview — Pixora AI" },
      { property: "og:description", content: "Pixora platform metrics dashboard." },
    ],
  }),
  component: AdminOverview,
});

const axis = { stroke: "var(--muted-foreground)", fontSize: 12 };

function AdminOverview() {
  return (
    <AdminShell title="Overview" description="How Pixora is performing right now.">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {ADMIN_STATS.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            delta={s.delta}
            positive={s.positive}
          />
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <ChartCard title="Daily generations" subtitle="Last 7 days">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={DAILY_GENERATIONS}>
              <defs>
                <linearGradient id="gen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={axis} />
              <YAxis tickLine={false} axisLine={false} tick={axis} width={48} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="generations"
                stroke="var(--primary)"
                fill="url(#gen)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue" subtitle="Monthly, USD">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={REVENUE_SERIES}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={axis} />
              <YAxis tickLine={false} axisLine={false} tick={axis} width={56} />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="revenue" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="surface-panel mt-6 overflow-hidden">
        <div className="flex items-center justify-between p-5">
          <h2 className="font-display text-base font-semibold text-foreground">
            Recent generations
          </h2>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/generations">View all</Link>
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Prompt</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Credits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ADMIN_GENERATIONS.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-mono text-xs">{g.id}</TableCell>
                  <TableCell>{g.user}</TableCell>
                  <TableCell>{g.model}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{g.prompt}</TableCell>
                  <TableCell>
                    <StatusBadge status={g.status} />
                  </TableCell>
                  <TableCell className="text-right">{g.credits}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminShell>
  );
}
