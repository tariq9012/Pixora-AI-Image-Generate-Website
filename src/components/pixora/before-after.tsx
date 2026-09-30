import { useState } from "react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";

export function BeforeAfter({
  before,
  after,
  className,
  labels = ["Before", "After"],
}: {
  before: string;
  after: string;
  className?: string;
  labels?: [string, string];
}) {
  const [pos, setPos] = useState(50);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative select-none overflow-hidden rounded-2xl border border-border">
        <img src={before} alt={labels[0]} className="w-full object-cover" />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
          <img
            src={after}
            alt={labels[1]}
            className="h-full w-[calc(100%*100/var(--pos))] max-w-none object-cover"
            style={{ ["--pos" as string]: pos }}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-primary"
          style={{ left: `${pos}%` }}
        >
          <span className="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-primary bg-background text-[10px] text-primary">
            ↔
          </span>
        </div>
        <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-1 text-xs text-foreground backdrop-blur">
          {labels[1]}
        </span>
        <span className="absolute right-3 top-3 rounded-full bg-background/80 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur">
          {labels[0]}
        </span>
      </div>
      <Slider value={[pos]} onValueChange={(v) => setPos(v[0] ?? 50)} min={0} max={100} step={1} />
    </div>
  );
}
