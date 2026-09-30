import { requireAdminUser } from "@/lib/auth/route-guards";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminShell } from "@/components/pixora/admin-shell";
import { ChartCard, StatCard } from "@/components/pixora/data-display";
import {
  DAILY_GENERATIONS,
  MODEL_POPULARITY,
  REVENUE_SERIES,
  STYLE_POPULARITY,
} from "@/lib/mock-data";

export const Route = createFileRoute("/admin/analytics")({
  beforeLoad: ({ context, location }) => {
    requireAdminUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Analytics — Pixora Admin" },
      { name: "description", content: "Usage, model popularity and revenue trends." },
      { property: "og:title", content: "Analytics — Pixora Admin" },
      { property: "og:description", content: "Deeper platform analytics for Pixora." },
    ],
  }),
  component: AdminAnalytics,
});

const axis = { stroke: "var(--muted-foreground)", fontSize: 12 };
const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
};
const SLICES = [
  "var(--primary)",
  "oklch(0.72 0.14 68)",
  "oklch(0.62 0.1 60)",
  "oklch(0.5 0.06 60)",
  "oklch(0.4 0.04 60)",
];

function AdminAnalytics() {
  return (
    <AdminShell title="Analytics" description="Where usage and revenue are heading.">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Avg. images / user" value="26.4" delta="+4.1%" />
        <StatCard label="Success rate" value="98.2%" delta="+0.4%" />
        <StatCard label="Avg. render time" value="8.6s" delta="-1.2s" />
        <StatCard label="Retention (30d)" value="61%" delta="+2.8%" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <ChartCard title="Active users" subtitle="Daily, last 7 days">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={DAILY_GENERATIONS}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={axis} />
              <YAxis tickLine={false} axisLine={false} tick={axis} width={48} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="users"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Model popularity" subtitle="Share of generations">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={MODEL_POPULARITY}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={3}
              >
                {MODEL_POPULARITY.map((entry, i) => (
                  <Cell key={entry.name} fill={SLICES[i % SLICES.length]} stroke="var(--card)" />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Style popularity" subtitle="Share of generations">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={STYLE_POPULARITY} layout="vertical">
              <CartesianGrid stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} tick={axis} />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tick={axis}
                width={110}
              />
              <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="var(--primary)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue trend" subtitle="Monthly, USD">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={REVENUE_SERIES}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={axis} />
              <YAxis tickLine={false} axisLine={false} tick={axis} width={56} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </AdminShell>
  );
}
