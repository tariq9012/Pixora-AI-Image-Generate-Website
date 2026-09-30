import { Copy, Download, Heart, Layers, Maximize2, Pencil, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ACTIONS = [
  { label: "Download", icon: Download },
  { label: "Favorite", icon: Heart },
  { label: "Edit", icon: Pencil },
  { label: "Create Variation", icon: Copy },
  { label: "Upscale", icon: Maximize2 },
  { label: "Save to Project", icon: Layers },
  { label: "Share", icon: Share2 },
] as const;

export function ResultCard({
  src,
  caption,
  onVariation,
  className,
}: {
  src: string;
  caption?: string;
  onVariation?: () => void;
  className?: string;
}) {
  const [fav, setFav] = useState(false);

  return (
    <figure
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card",
        className,
      )}
    >
      <img src={src} alt={caption ?? "Generated result"} className="w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/95 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1.5 p-3 opacity-0 transition-all group-hover:opacity-100">
        {ACTIONS.map((a) => (
          <Tooltip key={a.label}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={a.label}
                onClick={() => {
                  if (a.label === "Download") {
                    const link = document.createElement("a");
                    link.href = src;
                    link.download = "";
                    link.rel = "noopener noreferrer";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    return;
                  }
                  if (a.label === "Favorite") {
                    setFav((v) => !v);
                    toast.success(fav ? "Removed from favourites" : "Added to favourites");
                    return;
                  }
                  if (a.label === "Create Variation" && onVariation) {
                    onVariation();
                    return;
                  }
                  toast.success(`${a.label} — simulated`);
                }}
                className={cn(
                  "grid size-9 place-items-center rounded-full border border-border/70 bg-background/80 text-foreground/90 backdrop-blur transition-all hover:scale-105 hover:text-primary",
                  a.label === "Favorite" && fav && "border-primary/60 bg-primary/15 text-primary",
                )}
              >
                <a.icon className={cn("size-4", a.label === "Favorite" && fav && "fill-current")} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{a.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </figure>
  );
}
