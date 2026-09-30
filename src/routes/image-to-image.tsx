import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pixora/app-shell";
import { UploadArea } from "@/components/pixora/upload-area";
import { useAssetUpload } from "@/components/pixora/use-asset-upload";
import {
  GenerationControls,
  creditCost,
  useGenSettings,
} from "@/components/pixora/generation-controls";
import { ResultCard } from "@/components/pixora/result-card";
import { EmptyState } from "@/components/pixora/empty-state";
import { ErrorState } from "@/components/pixora/error-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  generateImageToImageFn,
  getActiveImageToImageModelsFn,
  getCreditBalanceFn,
} from "@/lib/ai/functions";

export const Route = createFileRoute("/image-to-image")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  loader: async () => {
    const [models, creditBalance] = await Promise.all([
      getActiveImageToImageModelsFn(),
      getCreditBalanceFn(),
    ]);
    return { models, creditBalance };
  },
  head: () => ({
    meta: [
      { title: "Image to Image — Pixora AI" },
      {
        name: "description",
        content: "Transform a reference image with prompt-driven control over style and structure.",
      },
      { property: "og:title", content: "Image to Image — Pixora AI" },
      { property: "og:description", content: "Transform any reference image with a prompt." },
    ],
  }),
  component: ImageToImage,
});

// Real states this page actually goes through — no invented percentage
// progress (Cloudflare doesn't expose one for this model), just an
// indeterminate "processing" phase.
type RealStatus = "ready" | "submitting" | "completed" | "failed";
const STATUS_LABEL: Record<RealStatus, string> = {
  ready: "Ready",
  submitting: "Processing",
  completed: "Completed",
  failed: "Failed",
};

function ImageToImage() {
  const { models, creditBalance: initialBalance } = Route.useLoaderData();
  const upload = useAssetUpload("IMAGE_TO_IMAGE_INPUT");
  const [prompt, setPrompt] = useState("");
  // count fixed at 1 (showCount={false} below) — Phase 7 always produces
  // exactly one output image; no fake multi-image results.
  const [settings, setSettings] = useGenSettings({ count: 1, model: models[0]?.name ?? "" });
  const [refStrength, setRefStrength] = useState([65]);
  const [status, setStatus] = useState<RealStatus>("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; url: string } | null>(null);
  const [balance, setBalance] = useState(initialBalance);

  const busy = status === "submitting";
  const hasActiveModel = models.length > 0;
  const cost = creditCost(settings, models);

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
      toast.error("Upload a reference image first");
      return;
    }
    if (!prompt.trim()) {
      toast.error("Describe the transformation first");
      return;
    }
    if (!hasActiveModel) {
      toast.error("No Image-to-Image model is available right now");
      return;
    }

    const selectedModel = models.find((m) => m.name === settings.model) ?? models[0];
    if (!selectedModel) {
      toast.error("Choose a model first");
      return;
    }
    // Soft, informational check only — the server independently
    // re-validates the real balance before spending anything.
    if (balance < cost) {
      toast.error("You don't have enough credits for this generation");
      return;
    }

    setStatus("submitting");
    setErrorMessage(null);

    try {
      const seedValue = settings.seed.trim() ? Number(settings.seed) : undefined;
      const response = await generateImageToImageFn({
        data: {
          modelSlug: selectedModel.slug,
          inputAssetId: upload.asset.id,
          prompt,
          negativePrompt: settings.negativePrompt || undefined,
          referenceStrength: refStrength[0],
          aspectRatio: settings.ratio,
          seed: seedValue,
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
      title="Image to Image"
      description="Upload a reference and describe the transformation you want."
    >
      <div className={`grid gap-6 ${hasActiveModel ? "xl:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
        <section className="space-y-5">
          {!hasActiveModel ? (
            <EmptyState
              icon={ImageIcon}
              title="Image to Image is coming soon"
              description="Real AI-powered transformations for this tool are still being connected. Check back soon."
            />
          ) : (
            <>
              <UploadArea
                preview={upload.preview}
                status={upload.status}
                error={upload.error}
                onFileSelected={(file) => void upload.upload(file)}
                onRemove={() => {
                  upload.reset();
                  reset();
                }}
                maxSizeMb={8}
              />

              <div className="surface-panel space-y-3 p-5">
                <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Prompt
                </Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder="Describe how you want to transform this image..."
                />
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <span className="text-xs text-muted-foreground">
                    Status: <span className="text-foreground">{STATUS_LABEL[status]}</span>
                    <span className="ml-3">
                      <span className="text-foreground">{balance.toLocaleString()}</span> credits
                    </span>
                  </span>
                  <Button disabled={busy} onClick={() => void generate()}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                    Generate · {cost} credits
                  </Button>
                </div>
              </div>

              {busy ? (
                <div className="surface-panel space-y-4 p-5">
                  <Progress value={undefined} className="animate-pulse" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Skeleton className="aspect-square rounded-2xl shimmer" />
                  </div>
                </div>
              ) : null}

              {status === "completed" && result ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <ResultCard
                    key={result.id}
                    src={result.url}
                    caption={prompt}
                    onVariation={() => void generate()}
                  />
                </div>
              ) : null}

              {status === "failed" ? (
                <ErrorState
                  description={errorMessage ?? undefined}
                  onRetry={() => void generate()}
                  onBack={reset}
                />
              ) : null}

              {status === "ready" && !upload.asset ? (
                <EmptyState
                  icon={ImageIcon}
                  title="No reference yet"
                  description="Upload an image above and Pixora will keep its structure while changing the look."
                />
              ) : null}
            </>
          )}
        </section>

        {hasActiveModel ? (
          <aside className="surface-panel h-fit space-y-6 p-5">
            {/* The active model (Cloudflare's pruna/p-image-edit) is a
                prompt-driven edit model — it doesn't document a
                strength/style-weight/face/composition-preservation
                parameter at all (unlike classic Stable Diffusion img2img).
                All four controls below stay visible for continuity with
                the page's existing design but are disabled rather than
                quietly doing nothing, per the "don't pretend unsupported
                options work" rule for this phase. Describing the desired
                change in the prompt itself is this model's real control
                surface. */}
            <div className="space-y-3 opacity-60">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Reference strength
                </Label>
                <span className="text-xs text-foreground">{refStrength[0]}%</span>
              </div>
              <Slider
                value={refStrength}
                onValueChange={setRefStrength}
                max={100}
                step={1}
                disabled
              />
              <p className="text-[11px] text-muted-foreground">
                Not supported by the active model — describe the change in your prompt instead.
              </p>
            </div>

            <div className="space-y-3 opacity-60">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Style strength
                </Label>
                <span className="text-xs text-foreground">40%</span>
              </div>
              <Slider value={[40]} max={100} step={1} disabled />
              <p className="text-[11px] text-muted-foreground">
                Not supported by the active model yet.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-3 opacity-60">
              <Label htmlFor="face" className="text-sm text-foreground">
                Preserve face
              </Label>
              <Switch id="face" disabled />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-3 opacity-60">
              <Label htmlFor="comp" className="text-sm text-foreground">
                Preserve composition
              </Label>
              <Switch id="comp" disabled />
            </div>
            <GenerationControls
              settings={settings}
              onChange={setSettings}
              showCount={false}
              models={models}
            />
          </aside>
        ) : null}
      </div>
    </AppShell>
  );
}
