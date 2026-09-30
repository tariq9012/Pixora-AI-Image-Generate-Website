import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Heart, Search } from "lucide-react";
import { AppShell } from "@/components/pixora/app-shell";
import { EmptyState } from "@/components/pixora/empty-state";
import { ImageGrid } from "@/components/pixora/image-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CATEGORIES, CREATIONS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/favorites")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Favorites — Pixora AI" },
      { name: "description", content: "The images you saved for later." },
      { property: "og:title", content: "Favorites — Pixora AI" },
      { property: "og:description", content: "Your saved Pixora images in one place." },
    ],
  }),
  component: Favorites,
});

function Favorites() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const items = useMemo(
    () =>
      CREATIONS.filter((c) => c.favorite)
        .filter((c) => category === "All" || c.category === category)
        .filter((c) => !query || c.prompt.toLowerCase().includes(query.toLowerCase())),
    [query, category],
  );

  return (
    <AppShell title="Favorites" description="Images you starred while browsing and creating.">
      <div className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {["All", ...CATEGORIES].map((c) => (
              <Badge
                key={c}
                variant="outline"
                onClick={() => setCategory(c)}
                className={cn(
                  "cursor-pointer px-3 py-1.5 font-normal transition-colors",
                  category === c
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c}
              </Badge>
            ))}
          </div>
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search favorites..."
              className="pl-9"
            />
          </div>
        </div>

        {items.length ? (
          <ImageGrid items={items} />
        ) : (
          <EmptyState
            icon={Heart}
            title="No favorites yet"
            description="Tap the heart on any image to keep it here."
            action={
              <Button asChild>
                <Link to="/explore">Explore gallery</Link>
              </Button>
            }
          />
        )}
      </div>
    </AppShell>
  );
}
