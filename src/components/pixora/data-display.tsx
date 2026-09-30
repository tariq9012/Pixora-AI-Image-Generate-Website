import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function StatCard({
  label,
  value,
  delta,
  positive,
}: {
  label: string;
  value: string;
  delta?: string;
  positive?: boolean;
}) {
  return (
    <div className="surface-panel p-5 transition-colors hover:border-primary/30">
      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold text-foreground">{value}</p>
      {delta ? (
        <p className={cn("mt-1 text-xs", positive === false ? "text-destructive" : "text-success")}>
          {delta} vs last month
        </p>
      ) : null}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("surface-panel p-5", className)}>
      <div className="mb-4">
        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="h-[260px] w-full">{children}</div>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  Completed: "border-success/40 bg-success/10 text-success",
  Paid: "border-success/40 bg-success/10 text-success",
  Active: "border-success/40 bg-success/10 text-success",
  Processing: "border-primary/40 bg-primary/10 text-primary",
  Queued: "border-border bg-muted text-muted-foreground",
  Pending: "border-warning/40 bg-warning/10 text-warning",
  Refunded: "border-warning/40 bg-warning/10 text-warning",
  Failed: "border-destructive/40 bg-destructive/10 text-destructive",
  Suspended: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", STATUS_STYLES[status] ?? "border-border text-muted-foreground")}
    >
      {status}
    </Badge>
  );
}
