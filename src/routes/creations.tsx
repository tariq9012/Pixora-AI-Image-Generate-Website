import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Download, ExternalLink, Heart, ImageOff, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pixora/app-shell";
import { EmptyState } from "@/components/pixora/empty-state";
import { ErrorState } from "@/components/pixora/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteCreationFn,
  listCreationsFn,
  listUsedModelsFn,
  toggleFavoriteFn,
} from "@/lib/creations/functions";
import { OPERATION_LABELS, type CreationListItem, type OperationType } from "@/lib/creations/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creations")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "My Creations — Pixora AI" },
      { name: "description", content: "Everything you've generated, edited and upscaled." },
      { property: "og:title", content: "My Creations — Pixora AI" },
      { property: "og:description", content: "Your generated, edited and upscaled images." },
    ],
  }),
  component: Creations,
});

/**
 * PHASE 12: real My Creations, backed by `listCreationsFn` /
 * `toggleFavoriteFn` / `deleteCreationFn` (see
 * src/lib/creations/queries.server.ts for the full audit note on what
 * this replaced — every tile, filter and button here used to be mock).
 */

const PAGE_SIZE = 20;

type TabValue = "all" | "favorites" | OperationType;

const TABS: { value: TabValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "TEXT_TO_IMAGE", label: OPERATION_LABELS.TEXT_TO_IMAGE },
  { value: "BACKGROUND_REMOVAL", label: OPERATION_LABELS.BACKGROUND_REMOVAL },
  { value: "UPSCALE", label: OPERATION_LABELS.UPSCALE },
  { value: "OUTPAINT", label: OPERATION_LABELS.OUTPAINT },
  { value: "EDITOR", label: OPERATION_LABELS.EDITOR },
  { value: "favorites", label: "Favorites" },
];

function download(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function CreationTile({
  item,
  onToggleFavorite,
  onRequestDelete,
  favoritePending,
}: {
  item: CreationListItem;
  onToggleFavorite: (id: string) => void;
  onRequestDelete: (item: CreationListItem) => void;
  favoritePending: boolean;
}) {
  return (
    <figure className="group overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-elevated">
      <div className="relative overflow-hidden">
        <img
          src={item.imageUrl}
          alt={item.title}
          loading="lazy"
          className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            // Real storage-failure safety net (spec §60): if the DB row
            // exists but the file is gone, don't leave a broken-image
            // icon glitching in the grid — swap to a plain placeholder.
            e.currentTarget.style.visibility = "hidden";
          }}
        />
        <div className="absolute inset-x-0 bottom-0 flex gap-1.5 bg-gradient-to-t from-background to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => window.open(item.imageUrl, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="size-4" /> Open
          </Button>
          <Button
            size="icon"
            variant="secondary"
            aria-label="Download"
            onClick={() => download(item.imageUrl)}
          >
            <Download className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            aria-label="Favorite"
            disabled={favoritePending}
            onClick={() => onToggleFavorite(item.id)}
          >
            <Heart className={cn("size-4", item.isFavorite && "fill-current text-primary")} />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            aria-label="Delete"
            onClick={() => onRequestDelete(item)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <figcaption className="space-y-2 p-3.5">
        <p className="line-clamp-2 text-sm text-foreground">{item.title}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Badge variant="outline" className="font-normal">
            {item.modelName ?? item.operationLabel}
          </Badge>
          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
        </div>
      </figcaption>
    </figure>
  );
}

function Creations() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabValue>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [modelId, setModelId] = useState("all");
  const [sinceDays, setSinceDays] = useState("any");
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<CreationListItem | null>(null);
  const [pendingFavoriteId, setPendingFavoriteId] = useState<string | null>(null);

  // Debounce free-text search so every keystroke doesn't hit the DB.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [tab, search, modelId, sinceDays]);

  const filters = {
    page,
    pageSize: PAGE_SIZE,
    type: tab !== "all" && tab !== "favorites" ? tab : undefined,
    favoritesOnly: tab === "favorites",
    modelId: modelId !== "all" ? modelId : undefined,
    search: search || undefined,
    sinceDays: sinceDays !== "any" ? Number(sinceDays) : undefined,
    sort: "newest" as const,
  };

  const creationsQuery = useQuery({
    queryKey: ["creations", filters],
    queryFn: () => listCreationsFn({ data: filters }),
  });

  const usedModelsQuery = useQuery({
    queryKey: ["used-models"],
    queryFn: () => listUsedModelsFn(),
    staleTime: 5 * 60 * 1000,
  });

  const favoriteMutation = useMutation({
    mutationFn: (creationId: string) => toggleFavoriteFn({ data: { creationId } }),
    onMutate: (creationId) => setPendingFavoriteId(creationId),
    onSettled: () => setPendingFavoriteId(null),
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["creations"] });
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (creationId: string) => deleteCreationFn({ data: { creationId } }),
    onSuccess: (result) => {
      setPendingDelete(null);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success("Creation deleted");
      void queryClient.invalidateQueries({ queryKey: ["creations"] });
    },
    onError: () => {
      setPendingDelete(null);
      toast.error("Something went wrong. Please try again.");
    },
  });

  const data = creationsQuery.data;
  const hasAnyFilterActive =
    tab !== "all" || Boolean(search) || modelId !== "all" || sinceDays !== "any";

  return (
    <AppShell
      title="My Creations"
      description={
        data ? `${data.total} image${data.total === 1 ? "" : "s"} across every tool.` : "Loading..."
      }
      actions={
        <Button asChild>
          <Link to="/studio">
            <Sparkles className="size-4" /> New generation
          </Link>
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
            <TabsList className="flex-wrap">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search your creations..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={sinceDays} onValueChange={setSinceDays}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any date</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              {(usedModelsQuery.data ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {creationsQuery.isPending ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-2xl" />
            ))}
          </div>
        ) : creationsQuery.isError ? (
          <ErrorState
            title="Couldn't load your creations"
            description="Something went wrong while loading your creations."
            onRetry={() => void creationsQuery.refetch()}
          />
        ) : data && data.items.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.items.map((item) => (
                <CreationTile
                  key={item.id}
                  item={item}
                  favoritePending={pendingFavoriteId === item.id}
                  onToggleFavorite={(id) => favoriteMutation.mutate(id)}
                  onRequestDelete={(it) => setPendingDelete(it)}
                />
              ))}
            </div>
            {data.total > PAGE_SIZE ? (
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {Math.max(1, Math.ceil(data.total / PAGE_SIZE))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={ImageOff}
            title={hasAnyFilterActive ? "No creations match your filters" : "No creations yet"}
            description={
              hasAnyFilterActive
                ? "Try a different tab, model or search term."
                : "Your generated images will appear here."
            }
            action={
              hasAnyFilterActive ? undefined : (
                <Button asChild>
                  <Link to="/studio">Create your first image</Link>
                </Button>
              )
            }
          />
        )}
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this creation?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from My Creations. Your generation history and credit records are
              kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
