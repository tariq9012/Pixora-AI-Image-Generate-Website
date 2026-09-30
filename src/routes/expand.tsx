import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pixora/app-shell";
import { useAssetUpload } from "@/components/pixora/use-asset-upload";
import { ErrorState } from "@/components/pixora/error-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  generateOutpaintFn,
  getActiveOutpaintModelsFn,
  getCreditBalanceFn,
} from "@/lib/ai/functions";

export const Route = createFileRoute("/expand")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  loader: async () => {
    const [models, creditBalance] = await Promise.all([
      getActiveOutpaintModelsFn(),
      getCreditBalanceFn(),
    ]);
    return { models, creditBalance };
  },
  head: () => ({
    meta: [
      { title: "AI Expand — Pixora AI" },
      {
        name: "description",
        content: "Outpaint beyond the original frame and change aspect ratio without cropping.",
      },
      { property: "og:title", content: "AI Expand — Pixora AI" },
      { property: "og:description", content: "Expand any image beyond its original frame." },
    ],
  }),
  component: ExpandPage,
});

const SIDES = ["Left", "Right", "Top", "Bottom"] as const;
type Side = (typeof SIDES)[number];

type RealStatus = "ready" | "submitting" | "completed" | "failed";
const STATUS_LABEL: Record<RealStatus, string> = {
  ready: "Ready",
  submitting: "Processing",
  completed: "Completed",
  failed: "Failed",
};

function ExpandPage() {
  const { models, creditBalance: initialBalance } = Route.useLoaderData();
  const [amounts, setAmounts] = useState<Record<Side, number>>({
    Left: 20,
    Right: 20,
    Top: 0,
    Bottom: 0,
  });
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<RealStatus>("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; url: string } | null>(null);
  const [balance, setBalance] = useState(initialBalance);
  const upload = useAssetUpload("OUTPAINT_INPUT");
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = status === "submitting";
  const model = models[0];
  const hasActiveModel = Boolean(model);
  const cost = model?.creditCost ?? 0;

  const width = 100 + amounts.Left + amounts.Right;
  const height = 100 + amounts.Top + amounts.Bottom;
  const ratio = (width / height).toFixed(2);

  const refreshBalance = async () => {
    try {
      setBalance(await getCreditBalanceFn());
    } catch (error) {
      console.error("Failed to refresh credit balance:", error);
    }
  };

  const reset = () => {
    setStatus("ready");
    setResult(null);
    setErrorMessage(null);
  };

  const generate = async () => {
    if (busy) return;
    if (!upload.asset) {
      toast.error("Upload an image first");
      return;
    }
    if (!prompt.trim()) {
      toast.error("Describe what should appear in the new area");
      return;
    }
    if (!model) {
      toast.error("No expand model is available right now");
      return;
    }
    if (amounts.Left + amounts.Right + amounts.Top + amounts.Bottom === 0) {
      toast.error("Choose at least one side to expand");
      return;
    }
    if (balance < cost) {
      toast.error("You don't have enough credits for this");
      return;
    }

    setStatus("submitting");
    setErrorMessage(null);

    try {
      const response = await generateOutpaintFn({
        data: {
          modelSlug: model.slug,
          inputAssetId: upload.asset.id,
          prompt,
          left: amounts.Left,
          right: amounts.Right,
          top: amounts.Top,
          bottom: amounts.Bottom,
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

  const sourceImage = upload.preview;

  return (
    <AppShell title="AI Expand" description="Grow the frame — Pixora paints what belongs there.">
      <div className={`grid gap-6 ${hasActiveModel ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        <section className="space-y-5">
          <div className="surface-panel p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-foreground">Source image</span>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void upload.upload(file);
                    reset();
                  }
                  e.target.value = "";
                }}
              />
              <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                {upload.status === "uploading" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Change image
              </Button>
            </div>

            {!sourceImage ? (
              <div className="grid place-items-center rounded-2xl border border-dashed border-primary/40 bg-background/40 p-12 text-sm text-muted-foreground">
                Upload an image to get started
              </div>
            ) : (
              <div className="relative mx-auto grid max-w-3xl place-items-center rounded-2xl border border-dashed border-primary/40 bg-background/40 p-6">
                <div
                  className="relative w-full transition-all duration-300"
                  style={{ aspectRatio: `${width} / ${height}` }}
                >
                  {status === "completed" && result ? (
                    <img
                      src={result.url}
                      alt="Expanded result"
                      className="absolute inset-0 h-full w-full rounded-xl border border-border object-cover shadow-elevated"
                    />
                  ) : (
                    <>
                      <div className="absolute inset-0 grid place-items-center rounded-xl border border-primary/25 bg-primary/5 text-xs text-muted-foreground">
                        Expanded canvas · {ratio}:1
                      </div>
                      <img
                        src={sourceImage}
                        alt="Image being expanded"
                        className="absolute rounded-lg border border-border object-cover shadow-elevated"
                        style={{
                          left: `${((amounts.Left ?? 0) / width) * 100}%`,
                          top: `${((amounts.Top ?? 0) / height) * 100}%`,
                          width: `${(100 / width) * 100}%`,
                          height: `${(100 / height) * 100}%`,
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            {busy ? (
              <div className="mt-5 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Painting outside the frame... this can take a little while.
                </p>
                <Progress value={undefined} className="animate-pulse" />
              </div>
            ) : null}
          </div>

          <div className="surface-panel space-y-3 p-5">
            <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Prompt
            </Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Describe what should appear outside the original image..."
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Status: <span className="text-foreground">{STATUS_LABEL[status]}</span>
                <span className="ml-3">
                  <span className="text-foreground">{balance.toLocaleString()}</span> credits
                </span>
              </span>
              <Button disabled={busy || !hasActiveModel} onClick={() => void generate()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {hasActiveModel ? `Expand Image · ${cost} credits` : "No model available"}
              </Button>
            </div>
          </div>

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
          <aside className="surface-panel h-fit space-y-5 p-5">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Expand by</p>
            {SIDES.map((side) => (
              <div key={side} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-foreground">{side}</Label>
                  <span className="text-xs text-muted-foreground">{amounts[side]}%</span>
                </div>
                <Slider
                  value={[amounts[side] ?? 0]}
                  onValueChange={(v) => setAmounts((a) => ({ ...a, [side]: v[0] ?? 0 }))}
                  max={100}
                  step={5}
                />
              </div>
            ))}
            <div className="rounded-xl border border-border bg-card px-3.5 py-3 text-sm">
              <span className="text-muted-foreground">New aspect ratio</span>
              <span className="float-right text-foreground">{ratio}:1</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Very large expansions may be scaled down automatically before generation to keep
              quality and processing time reasonable.
            </p>
          </aside>
        ) : null}
      </div>
    </AppShell>
  );
}
