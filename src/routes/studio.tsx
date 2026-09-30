import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Eraser, Expand, ImagePlus, Layers, Loader2, Pencil, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pixora/app-shell";
import { PromptComposer } from "@/components/pixora/prompt-composer";
import {
  GenerationControls,
  creditCost,
  useGenSettings,
} from "@/components/pixora/generation-controls";
import { ResultCard } from "@/components/pixora/result-card";
import { ErrorState } from "@/components/pixora/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { generateTextToImageFn, getActiveModelsFn, getCreditBalanceFn } from "@/lib/ai/functions";

export const Route = createFileRoute("/studio")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  loader: async () => {
    const [models, creditBalance] = await Promise.all([getActiveModelsFn(), getCreditBalanceFn()]);
    return { models, creditBalance };
  },
  head: () => ({
    meta: [
      { title: "Studio — Pixora AI" },
      {
        name: "description",
        content: "Generate, edit, upscale and expand images in the Pixora AI studio.",
      },
      { property: "og:title", content: "Studio — Pixora AI" },
      { property: "og:description", content: "Describe your idea and let Pixora AI build it." },
    ],
  }),
  component: Studio,
});

const MODES = [
  { label: "Generate", icon: Sparkles },
  { label: "Edit", icon: Pencil },
  { label: "Upscale", icon: Wand2 },
  { label: "Remove Background", icon: Eraser },
  { label: "Expand", icon: Expand },
] as const;

type GenStatus = "idle" | "submitting" | "completed" | "failed";
type GeneratedImage = { id: string; url: string };

function Studio() {
  const { models, creditBalance: initialBalance } = Route.useLoaderData();
  const [mode, setMode] = useState<string>("Generate");
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useGenSettings({ model: models[0]?.name ?? "" });
  const [status, setStatus] = useState<GenStatus>("idle");
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    if (!prompt.trim()) {
      toast.error("Describe your image first");
      return;
    }
    if (!hasActiveModel) {
      toast.error("No AI model is available right now");
      return;
    }

    const selectedModel = models.find((m) => m.name === settings.model);
    if (!selectedModel) {
      toast.error("Choose a model first");
      return;
    }
    // A soft, informational check only — the server independently
    // re-validates the real balance before spending anything.
    if (balance < cost) {
      toast.error("You don't have enough credits for this generation");
      return;
    }

    setStatus("submitting");
    setErrorMessage(null);

    try {
      const result = await generateTextToImageFn({
        data: {
          modelSlug: selectedModel.slug,
          prompt,
          negativePrompt: settings.negativePrompt || undefined,
          aspectRatio: settings.ratio,
          imageCount: settings.count,
          idempotencyKey: crypto.randomUUID(),
        },
      });

      if (!result.success) {
        setStatus("failed");
        setErrorMessage(result.message);
        void refreshBalance();
        return;
      }

      setResults(result.creations);
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
    setStatus("idle");
    setResults([]);
    setErrorMessage(null);
  };

  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* Left control panel */}
        <aside className="surface-panel h-fit space-y-6 p-5">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Creation Mode
            </p>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => setMode(m.label)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all",
                    mode === m.label
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  <m.icon className="size-4 shrink-0" />
                  <span className="truncate">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <GenerationControls settings={settings} onChange={setSettings} models={models} />
        </aside>

        {/* Center workspace */}
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-primary/40 text-primary">
                {settings.model || "No model available"}
              </Badge>
              <Badge variant="outline">{settings.ratio}</Badge>
              <Badge variant="outline">{settings.style}</Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              <span className="text-foreground">{balance.toLocaleString()}</span> credits available
            </span>
          </div>

          <div className="surface-panel min-h-[420px] p-4 sm:p-6">
            {status === "idle" ? (
              <div className="flex min-h-[380px] flex-col items-center justify-center text-center">
                <div className="relative mb-6 grid size-20 place-items-center rounded-3xl border border-border bg-background animate-float">
                  <div className="absolute inset-0 rounded-3xl hero-glow" />
                  <ImagePlus className="relative size-8 text-primary" />
                </div>
                <h2 className="font-display text-xl font-semibold text-foreground">
                  {hasActiveModel
                    ? "Your creation will appear here"
                    : "AI generation isn't configured yet"}
                </h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  {hasActiveModel
                    ? "Describe your idea and let Pixora AI bring it to life."
                    : "No AI model is enabled right now. Check back soon."}
                </p>
              </div>
            ) : null}

            {busy ? (
              <div className="space-y-5">
                <div className="flex items-center gap-3 text-sm text-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  Generating image...
                </div>
                <div
                  className={cn(
                    "grid gap-4",
                    settings.count > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
                  )}
                >
                  {Array.from({ length: settings.count }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square w-full rounded-2xl shimmer" />
                  ))}
                </div>
              </div>
            ) : null}

            {status === "completed" ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-foreground">
                    {results.length} image{results.length > 1 ? "s" : ""} · {cost} credits used
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => void generate()}>
                      <Layers className="size-4" /> Create Variations
                    </Button>
                    <Button variant="ghost" size="sm" onClick={reset}>
                      Clear
                    </Button>
                  </div>
                </div>
                <div
                  className={cn(
                    "grid gap-4",
                    results.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
                  )}
                >
                  {results.map((r) => (
                    <ResultCard
                      key={r.id}
                      src={r.url}
                      caption={prompt}
                      onVariation={() => void generate()}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {status === "failed" ? (
              <ErrorState
                description={errorMessage ?? undefined}
                onRetry={() => void generate()}
                onBack={reset}
              />
            ) : null}
          </div>

          <PromptComposer
            value={prompt}
            onChange={setPrompt}
            onGenerate={() => void generate()}
            cost={cost}
            busy={busy}
          />
        </section>
      </div>
    </AppShell>
  );
}
