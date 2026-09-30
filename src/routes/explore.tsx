import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { PublicShell } from "@/components/pixora/public-shell";
import { ImageGrid } from "@/components/pixora/image-card";
import { EmptyState } from "@/components/pixora/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CATEGORIES, CREATIONS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Explore creations — Pixora AI" },
      {
        name: "description",
        content:
          "Discover what creators are making with Pixora AI. Browse, remix and reuse prompts.",
      },
      { property: "og:title", content: "Explore creations — Pixora AI" },
      {
        property: "og:description",
        content: "Discover what creators are making with Pixora AI.",
      },
    ],
  }),
  component: Explore,
});

function Explore() {
  const [sort, setSort] = useState("trending");
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    let list = CREATIONS.filter(
      (c) =>
        (!category || c.category === category) &&
        (!query || c.prompt.toLowerCase().includes(query.toLowerCase())),
    );
    if (sort === "popular") list = [...list].sort((a, b) => b.likes - a.likes);
    if (sort === "latest") list = [...list].sort((a, b) => b.date.localeCompare(a.date));
    return list;
  }, [sort, category, query]);

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="max-w-2xl">
          <h1 className="font-display text-3xl font-semibold text-foreground sm:text-5xl">
            Explore creations
          </h1>
          <p className="mt-3 text-muted-foreground">
            Discover what creators are making with Pixora AI.
          </p>
        </header>

        <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={sort} onValueChange={setSort} className="w-full lg:w-auto">
            <TabsList>
              <TabsTrigger value="trending">Trending</TabsTrigger>
              <TabsTrigger value="latest">Latest</TabsTrigger>
              <TabsTrigger value="popular">Popular</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex w-full gap-2 lg:max-w-md">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search creations..."
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="icon" aria-label="Filters">
              <SlidersHorizontal className="size-4" />
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
              !category
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
                category === c
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-8">
          {items.length ? (
            <ImageGrid items={items} masonry />
          ) : (
            <EmptyState
              icon={Search}
              title="No creations match that search"
              description="Try a different keyword or clear the category filter."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setCategory(null);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          )}
        </div>
      </div>
    </PublicShell>
  );
}
