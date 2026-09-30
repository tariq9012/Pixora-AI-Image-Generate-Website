import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ErrorState({
  title = "Generation failed",
  description = "Something went wrong while generating your image.",
  onRetry,
  onBack,
  className,
}: {
  title?: string | undefined;
  description?: string | undefined;
  onRetry?: (() => void) | undefined;
  onBack?: (() => void) | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-destructive/30 bg-destructive/10">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 flex gap-2">
        {onRetry ? <Button onClick={onRetry}>Try Again</Button> : null}
        {onBack ? (
          <Button variant="outline" onClick={onBack}>
            Go Back
          </Button>
        ) : null}
      </div>
    </div>
  );
}
