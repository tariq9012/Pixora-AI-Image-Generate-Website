import { Link } from "@tanstack/react-router";
import { Bookmark, Download, Eye, Heart, Repeat2, Share2, Type } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Creation } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function compact(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

function HoverAction({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
          }}
          className={cn(
            "grid size-9 place-items-center rounded-full border border-border/70 bg-background/70 text-foreground/90 backdrop-blur transition-all hover:scale-105 hover:bg-background hover:text-primary active:scale-95",
            active && "border-primary/60 bg-primary/15 text-primary",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ImageCard({
  item,
  showMeta = true,
  className,
}: {
  item: Creation;
  showMeta?: boolean;
  className?: string;
}) {
  const [liked, setLiked] = useState(item.favorite);
  const [saved, setSaved] = useState(false);

  return (
    <figure
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-elevated",
        className,
      )}
    >
      <div className="relative overflow-hidden">
        <img
          src={item.src}
          alt={item.prompt}
          loading="lazy"
          className="w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-95" />

        <div className="absolute right-3 top-3 flex flex-col gap-2 opacity-0 transition-all duration-300 group-hover:opacity-100">
          <HoverAction
            label="Like"
            active={liked}
            onClick={() => {
              setLiked((v) => !v);
              toast.success(liked ? "Removed from likes" : "Added to likes");
            }}
          >
            <Heart className={cn("size-4", liked && "fill-current")} />
          </HoverAction>
          <HoverAction
            label="Save"
            active={saved}
            onClick={() => {
              setSaved((v) => !v);
              toast.success(saved ? "Removed from favourites" : "Saved to favourites");
            }}
          >
            <Bookmark className={cn("size-4", saved && "fill-current")} />
          </HoverAction>
          <HoverAction label="Share" onClick={() => toast.success("Share link copied")}>
            <Share2 className="size-4" />
          </HoverAction>
          <HoverAction label="Download" onClick={() => toast.success("Download started")}>
            <Download className="size-4" />
          </HoverAction>
        </div>

        <div className="absolute inset-x-3 bottom-3 translate-y-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <p className="line-clamp-2 text-xs leading-relaxed text-foreground/90">{item.prompt}</p>
          <div className="mt-3 flex gap-2">
            <Link
              to="/studio"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-transform hover:scale-[1.03]"
            >
              <Repeat2 className="size-3.5" /> Remix
            </Link>
            <button
              type="button"
              onClick={() => toast.success("Prompt copied to clipboard")}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur transition-colors hover:bg-accent"
            >
              <Type className="size-3.5" /> Use Prompt
            </button>
          </div>
        </div>
      </div>

      {showMeta ? (
        <figcaption className="flex items-center justify-between gap-3 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <img
              src={item.avatar}
              alt=""
              loading="lazy"
              className="size-6 shrink-0 rounded-full object-cover"
            />
            <span className="truncate text-xs text-muted-foreground">{item.creator}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <Badge variant="outline" className="hidden border-border/70 font-normal sm:inline-flex">
              {item.model}
            </Badge>
            <span className="inline-flex items-center gap-1">
              <Heart className="size-3.5" />
              {compact(item.likes)}
            </span>
            <span className="hidden items-center gap-1 sm:inline-flex">
              <Eye className="size-3.5" />
              {compact(item.views)}
            </span>
          </div>
        </figcaption>
      ) : null}
    </figure>
  );
}

export function ImageGrid({
  items,
  masonry = false,
  className,
}: {
  items: Creation[];
  masonry?: boolean;
  className?: string;
}) {
  if (masonry) {
    return (
      <div className={cn("columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4", className)}>
        {items.map((item) => (
          <ImageCard key={item.id} item={item} className="mb-5 break-inside-avoid" />
        ))}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {items.map((item) => (
        <ImageCard key={item.id} item={item} />
      ))}
    </div>
  );
}
