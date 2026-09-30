import { requireAuthenticatedUser } from "@/lib/auth/route-guards";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Download,
  Eraser,
  Loader2,
  Paintbrush,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pixora/app-shell";
import { BeforeAfter } from "@/components/pixora/before-after";
import { useAssetUpload } from "@/components/pixora/use-asset-upload";
import { ErrorState } from "@/components/pixora/error-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  generateEditorEditFn,
  getActiveEditorModelsFn,
  getCreditBalanceFn,
} from "@/lib/ai/functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/editor")({
  beforeLoad: ({ context, location }) => {
    requireAuthenticatedUser(context.user, location.href);
  },
  loader: async () => {
    const [models, creditBalance] = await Promise.all([
      getActiveEditorModelsFn(),
      getCreditBalanceFn(),
    ]);
    return { models, creditBalance };
  },
  head: () => ({
    meta: [
      { title: "AI Editor — Pixora AI" },
      {
        name: "description",
        content:
          "Paint a mask over the area you want changed, describe the change, and only that area is regenerated.",
      },
      { property: "og:title", content: "AI Editor — Pixora AI" },
      {
        property: "og:description",
        content: "Mask an area and describe the change — Pixora handles the pixels.",
      },
    ],
  }),
  component: Editor,
});

/**
 * PHASE 11 AUDIT NOTE: the previous version of this route was entirely
 * mock — `useMockGeneration` (a fake progress timer) and a hardcoded
 * static "after" image (IMAGES.street) regardless of what was uploaded
 * or typed. There was no canvas, no brush, no mask of any kind; every
 * click of "Generate Edit" just played the same fake animation. None of
 * that remains below — this is a real masked-inpainting editor wired to
 * generateEditorEditFn (see src/lib/ai/generation.server.ts's
 * generateEditorEdit for the real backend pipeline).
 *
 * These are prompt STARTERS only — clicking one fills the prompt field
 * as a convenience. They are not separate backend modes; every one of
 * them goes through the exact same masked-inpainting call. The previous
 * "Tools" sidebar looked similar but was pure decoration (`tool` state
 * was never read by the fake generation call at all).
 */
const QUICK_PROMPTS = [
  { label: "Remove object", prompt: "Remove this object and fill the background naturally." },
  { label: "Replace object", prompt: "Replace this with " },
  { label: "Change clothes", prompt: "Change this into a black leather jacket." },
  { label: "Change sky", prompt: "Replace the sky with a dramatic orange sunset with clouds." },
  { label: "Change background", prompt: "Replace the background with " },
  { label: "Add object", prompt: "Add " },
] as const;

type RealStatus = "ready" | "submitting" | "completed" | "failed";
const STATUS_LABEL: Record<RealStatus, string> = {
  ready: "Ready",
  submitting: "Processing",
  completed: "Completed",
  failed: "Failed",
};

const MAX_UNDO_STEPS = 20;
const DEFAULT_BRUSH_SIZE = 36;
/** Small offscreen canvas used only to cheaply answer "is anything
 * painted at all?" without reading a full-resolution ImageData buffer on
 * every pointer move — see hasAnyPaint() below. */
const PAINT_CHECK_SIZE = 48;

function Editor() {
  const { models, creditBalance: initialBalance } = Route.useLoaderData();
  const [prompt, setPrompt] = useState("");
  const [zoom, setZoom] = useState(100);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [mode, setMode] = useState<"brush" | "eraser">("brush");
  const [hasMask, setHasMask] = useState(false);
  const [status, setStatus] = useState<RealStatus>("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; url: string } | null>(null);
  const [balance, setBalance] = useState(initialBalance);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const upload = useAssetUpload("EDITOR_INPUT");
  const inputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const model = models[0];
  const hasActiveModel = Boolean(model);
  const cost = model?.creditCost ?? 0;
  const busy = status === "submitting";
  const sourceImage = upload.preview;

  useEffect(() => {
    if (upload.status === "error" && upload.error) {
      toast.error(upload.error);
    }
  }, [upload.status, upload.error]);

  const refreshBalance = async () => {
    try {
      setBalance(await getCreditBalanceFn());
    } catch (error) {
      console.error("Failed to refresh credit balance:", error);
    }
  };

  function resetGenerationState() {
    setStatus("ready");
    setResult(null);
    setErrorMessage(null);
  }

  function getCanvasContext() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  }

  /** Called once the <img> has real natural (post-EXIF-orientation, per
   * the browser's own decoding) dimensions available — sizes the overlay
   * canvas's INTERNAL resolution to match exactly, so a painted stroke's
   * canvas coordinates always correspond 1:1 with real image pixels
   * regardless of how large the image is displayed on screen or zoomed.
   * The server independently re-validates this exact-dimension
   * assumption (see buildEditorCanvas's dimension check) rather than
   * trusting it. */
  function initializeCanvasForImage(width: number, height: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, width, height);
    undoStack.current = [];
    redoStack.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setHasMask(false);
    setNaturalSize({ width, height });
  }

  function pushUndoSnapshot() {
    const canvas = canvasRef.current;
    const ctx = getCanvasContext();
    if (!canvas || !ctx) return;
    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.current.length > MAX_UNDO_STEPS) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }

  function restoreSnapshot(snapshot: ImageData) {
    const ctx = getCanvasContext();
    if (!ctx) return;
    ctx.putImageData(snapshot, 0, 0);
  }

  function undo() {
    const canvas = canvasRef.current;
    const ctx = getCanvasContext();
    if (!canvas || !ctx || undoStack.current.length === 0) return;
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(current);
    restoreSnapshot(previous);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
    void updateHasMask();
  }

  function redo() {
    const canvas = canvasRef.current;
    const ctx = getCanvasContext();
    if (!canvas || !ctx || redoStack.current.length === 0) return;
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(current);
    restoreSnapshot(next);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    void updateHasMask();
  }

  function clearMask() {
    const canvas = canvasRef.current;
    const ctx = getCanvasContext();
    if (!canvas || !ctx) return;
    pushUndoSnapshot();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasMask(false);
  }

  /** Cheap "is anything painted?" check — downsamples the real canvas
   * onto a tiny (48x48) scratch canvas and checks for any non-zero
   * alpha, rather than scanning a potentially multi-megapixel ImageData
   * buffer on every stroke. Real client-side gate for the Generate
   * button (spec Section 18) — the server independently re-checks
   * coverage on the real full-resolution mask regardless (spec Section 18,
   * Section 61). */
  function hasAnyPaint(): boolean {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const scratch = document.createElement("canvas");
    scratch.width = PAINT_CHECK_SIZE;
    scratch.height = PAINT_CHECK_SIZE;
    const sctx = scratch.getContext("2d");
    if (!sctx) return false;
    sctx.drawImage(canvas, 0, 0, PAINT_CHECK_SIZE, PAINT_CHECK_SIZE);
    const data = sctx.getImageData(0, 0, PAINT_CHECK_SIZE, PAINT_CHECK_SIZE).data;
    for (let i = 3; i < data.length; i += 4) {
      if ((data[i] ?? 0) > 10) return true;
    }
    return false;
  }

  async function updateHasMask() {
    setHasMask(hasAnyPaint());
  }

  function canvasPointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      // brush radius in "CSS pixels" so it looks the same size regardless
      // of the source image's real resolution or the current zoom level.
      y: (e.clientY - rect.top) * scaleY,
      scale: (scaleX + scaleY) / 2,
    };
  }

  function strokeTo(
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    radius: number,
  ) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = radius * 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    // Also draw a filled dot at `to` so a single click/tap without any
    // movement still paints something (a zero-length stroke draws
    // nothing on some browsers).
    ctx.beginPath();
    ctx.arc(to.x, to.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!naturalSize || busy) return;
    const canvas = canvasRef.current;
    const ctx = getCanvasContext();
    const point = canvasPointFromEvent(e);
    if (!canvas || !ctx || !point) return;
    canvas.setPointerCapture(e.pointerId);
    pushUndoSnapshot();
    drawingRef.current = true;
    lastPointRef.current = point;

    ctx.globalCompositeOperation = mode === "brush" ? "source-over" : "destination-out";
    ctx.fillStyle = "rgba(168, 85, 247, 0.55)";
    ctx.strokeStyle = "rgba(168, 85, 247, 0.55)";
    const radius = (brushSize / 2) * point.scale;
    strokeTo(ctx, point, point, radius);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = getCanvasContext();
    const point = canvasPointFromEvent(e);
    const last = lastPointRef.current;
    if (!ctx || !point || !last) return;
    const radius = (brushSize / 2) * point.scale;
    strokeTo(ctx, last, point, radius);
    lastPointRef.current = point;
  }

  function endStroke() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    void updateHasMask();
  }

  /** Reads the overlay canvas's real alpha channel and builds an
   * authoritative black=preserve/white=generate PNG at the SAME natural
   * resolution as the source image — this is the actual real mask sent
   * to the server (never the colored overlay itself, which is only for
   * the user to see; spec Section 17). */
  function buildMaskBase64(): string | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const src = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const mctx = maskCanvas.getContext("2d");
    if (!mctx) return null;
    const out = mctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < src.data.length; i += 4) {
      const alpha = src.data[i + 3] ?? 0;
      const value = alpha > 10 ? 255 : 0;
      out.data[i] = value;
      out.data[i + 1] = value;
      out.data[i + 2] = value;
      out.data[i + 3] = 255;
    }
    mctx.putImageData(out, 0, 0);

    const dataUrl = maskCanvas.toDataURL("image/png");
    const commaIndex = dataUrl.indexOf(",");
    return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : null;
  }

  const generate = async () => {
    if (busy) return;
    if (!upload.asset) {
      toast.error("Upload an image first");
      return;
    }
    if (!prompt.trim()) {
      toast.error("Describe the edit first");
      return;
    }
    if (!model) {
      toast.error("No editor model is available right now");
      return;
    }
    if (!hasAnyPaint()) {
      toast.error("Paint the area you want to change first");
      return;
    }
    if (balance < cost) {
      toast.error("You don't have enough credits for this");
      return;
    }

    const maskImage = buildMaskBase64();
    if (!maskImage) {
      toast.error("Could not read the mask. Please try again.");
      return;
    }

    setStatus("submitting");
    setErrorMessage(null);

    try {
      const response = await generateEditorEditFn({
        data: {
          modelSlug: model.slug,
          inputAssetId: upload.asset.id,
          prompt,
          maskImage,
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

  return (
    <AppShell
      title="AI Image Editor"
      description="Paint a mask, describe the change — Pixora edits only that area."
    >
      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="surface-panel h-fit space-y-4 p-4">
          <div className="space-y-2">
            <p className="px-1 pb-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Brush
            </p>
            <div className="flex gap-2 px-1">
              <Button
                type="button"
                size="sm"
                variant={mode === "brush" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setMode("brush")}
              >
                <Paintbrush className="size-4" /> Paint
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "eraser" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setMode("eraser")}
              >
                <Eraser className="size-4" /> Erase
              </Button>
            </div>
            <div className="space-y-1.5 px-1 pt-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Brush size</Label>
                <span className="text-xs text-muted-foreground">{brushSize}px</span>
              </div>
              <Slider
                value={[brushSize]}
                onValueChange={(v) => setBrushSize(v[0] ?? DEFAULT_BRUSH_SIZE)}
                min={8}
                max={150}
                step={2}
              />
            </div>
            <div className="flex gap-1.5 px-1 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={undo}
                disabled={!canUndo}
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={redo}
                disabled={!canRedo}
              >
                <Redo2 className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={clearMask}
                disabled={!hasMask}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="px-1 pb-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Quick prompts
            </p>
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setPrompt(q.prompt)}
                className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
              >
                {q.label}
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-5">
          <div className="surface-panel p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-foreground">
                {hasActiveModel ? "Paint the area to change" : "No editor model available"}
              </span>
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void upload.upload(file);
                      resetGenerationState();
                      setNaturalSize(null);
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
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Zoom out"
                  onClick={() => setZoom((z) => Math.max(50, z - 10))}
                >
                  <ZoomOut className="size-4" />
                </Button>
                <span className="w-14 text-center text-xs text-muted-foreground">{zoom}%</span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Zoom in"
                  onClick={() => setZoom((z) => Math.min(200, z + 10))}
                >
                  <ZoomIn className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reset zoom"
                  onClick={() => setZoom(100)}
                >
                  <RotateCcw className="size-4" />
                </Button>
              </div>
            </div>

            <div className="overflow-auto rounded-2xl">
              <div
                style={{ transform: `scale(${zoom / 100})` }}
                className="origin-top-left transition-transform duration-300"
              >
                {!sourceImage ? (
                  <div className="grid place-items-center rounded-2xl border border-dashed border-primary/40 bg-background/40 p-12 text-sm text-muted-foreground">
                    Upload an image to get started
                  </div>
                ) : status === "completed" && result ? (
                  <BeforeAfter before={sourceImage} after={result.url} />
                ) : (
                  <div className="relative inline-block">
                    <img
                      ref={imgRef}
                      src={sourceImage}
                      alt="Image being edited"
                      className="block max-w-full rounded-2xl border border-border object-contain"
                      onLoad={(e) => {
                        const el = e.currentTarget;
                        if (el.naturalWidth && el.naturalHeight) {
                          initializeCanvasForImage(el.naturalWidth, el.naturalHeight);
                        }
                      }}
                    />
                    <canvas
                      ref={canvasRef}
                      className={cn(
                        "absolute inset-0 h-full w-full touch-none rounded-2xl",
                        busy ? "pointer-events-none opacity-70" : "cursor-crosshair",
                      )}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={endStroke}
                      onPointerLeave={endStroke}
                      onPointerCancel={endStroke}
                    />
                  </div>
                )}
              </div>
            </div>

            {busy ? (
              <div className="mt-5 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Applying your edit... this can take a little while.
                </p>
                <Progress value={undefined} className="animate-pulse" />
              </div>
            ) : null}
          </div>

          <div className="surface-panel space-y-3 p-5">
            <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              What would you like to change?
            </Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Change the shirt to a black leather jacket."
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Status: <span className="text-foreground">{STATUS_LABEL[status]}</span>
                <span className="ml-3">
                  <span className="text-foreground">{balance.toLocaleString()}</span> credits
                </span>
              </span>
              <Button
                disabled={busy || !hasActiveModel || !hasMask}
                onClick={() => void generate()}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {hasActiveModel ? `Generate Edit · ${cost} credits` : "No model available"}
              </Button>
            </div>
          </div>

          {status === "failed" ? (
            <ErrorState
              description={errorMessage ?? undefined}
              onRetry={() => void generate()}
              onBack={resetGenerationState}
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
      </div>
    </AppShell>
  );
}
