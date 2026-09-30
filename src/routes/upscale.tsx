import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, ImageUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pixora/app-shell";
import { UploadArea } from "@/components/pixora/upload-area";
import { useAssetUpload } from "@/components/pixora/use-asset-upload";
import { BeforeAfter } from "@/components/pixora/before-after";
import { EmptyState } from "@/components/pixora/empty-state";
import { ErrorState } from "@/components/pixora/error-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  generateUpscaleFn,
  getActiveUpscaleModelsFn,
  getCreditBalanceFn,
} from "@/lib/ai/functions";

export const Route = createFileRoute("/upscale")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  loader: async () => {
    const [models, creditBalance] = await Promise.all([
      getActiveUpscaleModelsFn(),
      getCreditBalanceFn(),
    ]);
    return { models, creditBalance };
  },
  head: () => ({
    meta: [
      { title: "Upscale — Pixora AI" },
      {
        name: "description",
        content: "Enhance any image 2x or 4x with real AI super-resolution.",
      },
      { property: "og:title", content: "Upscale — Pixora AI" },
      { property: "og:description", content: "Enhance your image without losing detail." },
    ],
  }),
  component: Upscale,
});

type RealStatus = "ready" | "submitting" | "completed" | "failed";
const STATUS_LABEL: Record<RealStatus, string> = {
  ready: "Ready",
  submitting: "Processing",
  completed: "Completed",
  failed: "Failed",
};

// Only 2x and 4x are real (see local/upscale.server.ts) — 8x is shown
// disabled rather than silently downgraded to 4x or faked.
const FACTORS = [2, 4, 8] as const;

function Upscale() {
  const { models, creditBalance: initialBalance } = Route.useLoaderData();
  const upload = useAssetUpload("UPSCALE_INPUT");
  const [factor, setFactor] = useState<2 | 4>(2);
  const [status, setStatus] = useState<RealStatus>("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; url: string } | null>(null);
  const [balance, setBalance] = useState(initialBalance);

  const busy = status === "submitting";
  const model = models[0];
  const hasActiveModel = Boolean(model);
  const cost = model ? (factor === 4 ? model.creditCost * 2 : model.creditCost) : 0;

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
      toast.error("No upscale model is available right now");
      return;
    }
    if (balance < cost) {
      toast.error("You don't have enough credits for this");
      return;
    }

    setStatus("submitting");
    setErrorMessage(null);

    try {
      const response = await generateUpscaleFn({
        data: {
          modelSlug: model.slug,
          inputAssetId: upload.asset.id,
          factor,
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
    <AppShell title="Enhance your image" description="Real AI super-resolution, 2x or 4x.">
      <div className={`grid gap-6 ${hasActiveModel ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        <section className="space-y-5">
          {!hasActiveModel ? (
            <EmptyState
              icon={ImageUp}
              title="Upscale is coming soon"
              description="This tool isn't connected yet. Check back soon."
            />
          ) : status === "completed" && result && upload.preview ? (
            <div className="surface-panel p-5">
              <BeforeAfter
                before={upload.preview}
                after={result.url}
                labels={["Original", `Enhanced ${factor}×`]}
              />
            </div>
          ) : (
            <UploadArea
              title="Upload an image to enhance"
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
              <p className="text-sm text-muted-foreground">
                Enhancing detail... this can take a little while on first use.
              </p>
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

          {status === "completed" && result ? (
            <Button
              variant="outline"
              onClick={() => {
                const link = document.createElement("a");
                link.href = result.url;
                link.download = "";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
            >
              <Download className="size-4" /> Download
            </Button>
          ) : null}
        </section>

        {hasActiveModel ? (
          <aside className="surface-panel h-fit space-y-6 p-5">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Scale
              </Label>
              <div className="flex gap-2">
                {FACTORS.map((f) => {
                  const supported = f === 2 || f === 4;
                  return (
                    <button
                      key={f}
                      type="button"
                      disabled={!supported}
                      title={!supported ? "Not available yet — no real 8x model" : undefined}
                      onClick={() => supported && setFactor(f)}
                      className={cn(
                        "flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all",
                        !supported
                          ? "cursor-not-allowed border-border bg-card text-muted-foreground/40"
                          : factor === f
                            ? "border-primary/60 bg-primary/15 text-primary"
                            : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {f}×
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Real-ESRGAN is a single general restoration network — it
                has no separate switchable face-restoration sub-model
                (that would be a different model, e.g. GFPGAN) and no
                on/off "detail mode"; enhancement is simply what the
                model always does. Shown disabled rather than wired to a
                no-op toggle. */}
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-3 opacity-60">
                <Label htmlFor="face" className="text-sm text-foreground">
                  Face enhancement
                </Label>
                <Switch id="face" disabled />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-3 opacity-60">
                <Label htmlFor="detail" className="text-sm text-foreground">
                  Detail enhancement
                </Label>
                <Switch id="detail" disabled checked />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Always on — this model doesn't support turning them off separately.
              </p>
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
              Enhance Image · {cost} credits
            </Button>
          </aside>
        ) : null}
      </div>
    </AppShell>
  );
}
