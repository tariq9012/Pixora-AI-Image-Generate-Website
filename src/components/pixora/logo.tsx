import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Logo({ className, to = "/" }: { className?: string; to?: string }) {
  return (
    <Link
      to={to}
      className={cn("group inline-flex items-center gap-2.5", className)}
      aria-label="Pixora AI home"
    >
      <span className="relative grid size-8 place-items-center rounded-[10px] bg-[image:var(--gradient-primary)] shadow-glow transition-transform duration-300 group-hover:scale-105">
        <span className="size-3 rounded-[4px] bg-primary-foreground/90" />
      </span>
      <span className="font-display text-[17px] font-bold tracking-tight text-foreground">
        Pixora <span className="text-primary">AI</span>
      </span>
    </Link>
  );
}
