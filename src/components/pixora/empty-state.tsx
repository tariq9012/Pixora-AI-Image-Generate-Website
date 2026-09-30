import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "surface-panel flex flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
    >
      <div className="relative mb-5 grid size-16 place-items-center rounded-2xl border border-border bg-background/60">
        <div className="absolute inset-0 rounded-2xl hero-glow opacity-60" />
        <Icon className="relative size-7 text-primary" />
      </div>
      <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
