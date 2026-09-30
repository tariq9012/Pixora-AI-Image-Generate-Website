import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Download, History as HistoryIcon, Type } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pixora/app-shell";
import { EmptyState } from "@/components/pixora/empty-state";
import { ErrorState } from "@/components/pixora/error-state";
import { StatusBadge } from "@/components/pixora/data-display";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listHistoryFn, listUsedModelsFn } from "@/lib/creations/functions";
import {
  OPERATION_LABELS,
  STATUS_LABELS,
  type HistoryStatus,
  type OperationType,
} from "@/lib/creations/types";

export const Route = createFileRoute("/history")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  head: () => ({
    meta: [
      { title: "Generation History — Pixora AI" },
      {
        name: "description",
        content: "Every generation with its model, settings and credit cost.",
      },
      { property: "og:title", content: "Generation History — Pixora AI" },
      { property: "og:description", content: "Review your past generations." },
    ],
  }),
  component: HistoryPage,
});

/**
 * PHASE 12: real Generation History, backed by `listHistoryFn` (see
 * src/lib/creations/history.server.ts for the full audit note — every
 * row, status, and credit figure here used to be mock, and
 * "Regenerate"/"Edit"/"Delete" were toast-only fakes that are now either
 * removed or genuinely implemented; see that file's comment for exactly
 * why each one was or wasn't kept).
 */

const PAGE_SIZE = 20;

function download(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function HistoryPage() {
  const [status, setStatus] = useState<HistoryStatus | "all">("all");
  const [type, setType] = useState<OperationType | "all">("all");
  const [modelId, setModelId] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [status, type, modelId]);

  const filters = {
    page,
    pageSize: PAGE_SIZE,
    status: status !== "all" ? status : undefined,
    type: type !== "all" ? type : undefined,
    modelId: modelId !== "all" ? modelId : undefined,
    sort: "newest" as const,
  };

  const historyQuery = useQuery({
    queryKey: ["history", filters],
    queryFn: () => listHistoryFn({ data: filters }),
  });

  const usedModelsQuery = useQuery({
    queryKey: ["used-models"],
    queryFn: () => listUsedModelsFn(),
    staleTime: 5 * 60 * 1000,
  });

  const data = historyQuery.data;
  const hasAnyFilterActive = status !== "all" || type !== "all" || modelId !== "all";

  return (
    <AppShell title="Generation History" description="Every job, with the settings that made it.">
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as HistoryStatus | "all")}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_LABELS) as HistoryStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(v) => setType(v as OperationType | "all")}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(Object.keys(OPERATION_LABELS) as OperationType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {OPERATION_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
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

        {historyQuery.isPending ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-2xl" />
            ))}
          </div>
        ) : historyQuery.isError ? (
          <ErrorState
            title="Couldn't load your history"
            description="Something went wrong while loading your generation history."
            onRetry={() => void historyQuery.refetch()}
          />
        ) : data && data.items.length > 0 ? (
          <>
            <ol className="space-y-4">
              {data.items.map((h) => (
                <li
                  key={h.id}
                  className="surface-panel flex flex-col gap-4 p-4 transition-colors hover:border-primary/30 sm:flex-row"
                >
                  {h.outputImageUrl ? (
                    <img
                      src={h.outputImageUrl}
                      alt={h.prompt ?? h.operationLabel}
                      loading="lazy"
                      className="h-32 w-full shrink-0 rounded-xl object-cover sm:w-32"
                    />
                  ) : (
                    <div className="grid h-32 w-full shrink-0 place-items-center rounded-xl border border-dashed border-border bg-muted/40 text-xs text-muted-foreground sm:w-32">
                      No output
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={STATUS_LABELS[h.status]} />
                      <Badge variant="outline">{h.operationLabel}</Badge>
                      <span className="text-xs text-muted-foreground">
                        · {new Date(h.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-foreground">
                      {h.prompt ?? <span className="italic text-muted-foreground">No prompt</span>}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {h.modelName ?? h.operationLabel} ·{" "}
                      {h.creditsUsed > 0
                        ? `${h.creditsUsed} credits`
                        : h.wasRefunded
                          ? "Refunded"
                          : "No charge"}
                    </p>
                    {h.status === "FAILED" && h.errorMessage ? (
                      <p className="mt-1 text-xs text-destructive">{h.errorMessage}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {h.prompt ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            void navigator.clipboard.writeText(h.prompt ?? "");
                            toast.success("Prompt copied");
                          }}
                        >
                          <Type className="size-3.5" /> Use Prompt
                        </Button>
                      ) : null}
                      {h.outputImageUrl ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => download(h.outputImageUrl!)}
                        >
                          <Download className="size-3.5" /> Download
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
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
            icon={HistoryIcon}
            title={hasAnyFilterActive ? "No generations match your filters" : "Nothing in history"}
            description={
              hasAnyFilterActive
                ? "Try a different status, type or model."
                : "Generations you run will be listed here with their settings."
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
    </AppShell>
  );
}
