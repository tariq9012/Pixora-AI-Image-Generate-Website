import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Loader2, ScissorsLineDashed } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pixora/app-shell";
import { UploadArea } from "@/components/pixora/upload-area";
import { useAssetUpload } from "@/components/pixora/use-asset-upload";
import { ResultCard } from "@/components/pixora/result-card";
import { EmptyState } from "@/components/pixora/empty-state";
import { ErrorState } from "@/components/pixora/error-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  generateBackgroundRemovalFn,
  getActiveBackgroundRemovalModelsFn,
  getCreditBalanceFn,
} from "@/lib/ai/functions";

export const Route = createFileRoute("/remove-background")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  loader: async () => {
    const [models, creditBalance] = await Promise.all([
      getActiveBackgroundRemovalModelsFn(),
      getCreditBalanceFn(),
    ]);
    return { models, creditBalance };
  },
  head: () => ({
    meta: [
      { title: "Remove Background — Pixora AI" },
      {
        name: "description",
        content: "Remove backgrounds instantly and export clean transparent PNGs.",
      },
      { property: "og:title", content: "Remove Background — Pixora AI" },
      { property: "og:description", content: "Clean cutouts with crisp edges, in one click." },
    ],
  }),
  component: RemoveBackground,
});

type RealStatus = "ready" | "submitting" | "completed" | "failed";
const STATUS_LABEL: Record<RealStatus, string> = {
  ready: "Ready",
  submitting: "Processing",
  completed: "Completed",
  failed: "Failed",
};

// Only "Transparent" is real this phase — the model only ever produces a
// transparent-background cutout. The other three options are shown
// disabled rather than silently doing nothing, per Phase 8's "don't send
// fake controls" rule: solid/custom/AI backgrounds would need additional
// compositing work not implemented yet.
const BACKGROUND_OPTIONS = ["Transparent", "White", "Custom Background", "AI Generated Background"];

function RemoveBackground() {
  const { models, creditBalance: initialBalance } = Route.useLoaderData();
  const upload = useAssetUpload("BACKGROUND_REMOVAL_INPUT");
  const [status, setStatus] = useState<RealStatus>("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; url: string } | null>(null);
  const [balance, setBalance] = useState(initialBalance);

  const busy = status === "submitting";
  const hasActiveModel = models.length > 0;
  const model = models[0];
  const cost = model?.creditCost ?? 0;

  const refreshBalance = async () => {
    try {
      setBalance(await getCreditBalanceFn());
    } catch (error) {
      console.error("Failed to refresh credit balance:", error);
    }
  };

  const generate = async () => {
    if (busy) return;
    if (!upload.asset) {
      toast.error("Upload an image first");
      return;
    }
    if (!model) {
      toast.error("No background removal model is available right now");
      return;
    }
    if (balance < cost) {
      toast.error("You don't have enough credits for this");
      return;
    }

    setStatus("submitting");
    setErrorMessage(null);

    try {
      const response = await generateBackgroundRemovalFn({
        data: {
          modelSlug: model.slug,
          inputAssetId: upload.asset.id,
          idempotencyKey: crypto.randomUUID(),
        },
      });

      if (!response.success) {
        setStatus("failed");
        setErrorMessage(response.message);
        void refreshBalance();
        return;
      }

      setResult(response.creation);
      setStatus("completed");
      void refreshBalance();
    } catch (error) {
      console.error(error);
      setStatus("failed");
      setErrorMessage("Something went wrong. Please try again.");
      void refreshBalance();
    }
  };

  const reset = () => {
    setStatus("ready");
    setResult(null);
    setErrorMessage(null);
  };

  return (
    <AppShell
      title="Remove backgrounds instantly"
      description="Upload an image and Pixora isolates the subject."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-5">
          {!hasActiveModel ? (
            <EmptyState
              icon={ScissorsLineDashed}
              title="Background Removal is coming soon"
              description="This tool isn't connected yet. Check back soon."
            />
          ) : status === "completed" && result ? (
            <div className="surface-panel p-5">
              <div className="checkerboard overflow-hidden rounded-2xl border border-border">
                <ResultCard
                  src={result.url}
                  caption="Background removed"
                  className="bg-transparent"
                />
              </div>
            </div>
          ) : (
            <UploadArea
              title="Upload an image"
              preview={upload.preview}
              status={upload.status}
              error={upload.error}
              onFileSelected={(file) => void upload.upload(file)}
              onRemove={() => {
                upload.reset();
                reset();
              }}
            />
          )}

          {busy ? (
            <div className="surface-panel space-y-2 p-5">
              <p className="text-sm text-muted-foreground">Isolating subject...</p>
              <Progress value={undefined} className="animate-pulse" />
              <Skeleton className="aspect-square rounded-2xl shimmer" />
            </div>
          ) : null}

          {status === "failed" ? (
            <ErrorState
              description={errorMessage ?? undefined}
              onRetry={() => void generate()}
              onBack={reset}
            />
          ) : null}
        </section>

        {hasActiveModel ? (
          <aside className="surface-panel h-fit space-y-5 p-5">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Background
              </Label>
              <div className="grid gap-2">
                {BACKGROUND_OPTIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    disabled={o !== "Transparent"}
                    title={
                      o !== "Transparent" ? "Not supported by the active model yet" : undefined
                    }
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-left text-sm transition-all",
                      o === "Transparent"
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "cursor-not-allowed border-border bg-card text-muted-foreground/50",
                    )}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Status: <span className="text-foreground">{STATUS_LABEL[status]}</span>
              </span>
              <span>
                <span className="text-foreground">{balance.toLocaleString()}</span> credits
              </span>
            </div>

            <Button className="w-full" disabled={busy} onClick={() => void generate()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Remove Background · {cost} credits
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={status !== "completed" || !result}
              onClick={() => {
                if (!result) return;
                const link = document.createElement("a");
                link.href = result.url;
                link.download = "";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
            >
              <Download className="size-4" /> Download PNG
            </Button>
          </aside>
        ) : null}
      </div>
    </AppShell>
  );
}
