import { ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import { ASPECT_RATIOS, IMAGE_COUNTS, MODELS, RESOLUTIONS, STYLES } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export type GenSettings = {
  model: string;
  ratio: string;
  resolution: string;
  count: number;
  style: string;
  negativePrompt: string;
  seed: string;
};

export function useGenSettings(initial?: Partial<GenSettings>) {
  return useState<GenSettings>({
    model: "Pixora Pro",
    ratio: "1:1",
    resolution: "1024",
    count: 4,
    style: "Photorealistic",
    negativePrompt: "",
    seed: "",
    ...initial,
  });
}

export function creditCost(
  s: GenSettings,
  models?: ReadonlyArray<{ name: string; creditCost: number }>,
) {
  if (models) {
    const base = models.find((m) => m.name === s.model)?.creditCost ?? 0;
    return base * s.count;
  }
  const base = MODELS.find((m) => m.name === s.model)?.cost ?? 8;
  const resMultiplier = s.resolution === "4K" ? 3 : s.resolution === "2048" ? 2 : 1;
  return base * resMultiplier;
}

function Chips<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
              value === opt
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ModelSelector({
  value,
  onChange,
  models,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Real, database-backed models (Studio). Omit to keep the existing
   * mock model list (every other page using this component today). */
  models?: ReadonlyArray<{ id: string; name: string; creditCost: number }> | undefined;
}) {
  if (models) {
    return (
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Model</Label>
        {models.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No models are available right now.
          </p>
        ) : (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.name}>
                  <span className="flex items-center gap-2">
                    {m.name}
                    <span className="text-xs text-muted-foreground">{m.creditCost} cr</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Model</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODELS.map((m) => (
            <SelectItem key={m.id} value={m.name}>
              <span className="flex items-center gap-2">
                {m.name}
                <span className="text-xs text-muted-foreground">
                  {m.cost} cr · {m.speed}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function GenerationControls({
  settings,
  onChange,
  showCount = true,
  models,
}: {
  settings: GenSettings;
  onChange: (s: GenSettings) => void;
  showCount?: boolean;
  /** Real, database-backed models (Studio only) — see ModelSelector. */
  models?: ReadonlyArray<{ id: string; name: string; creditCost: number }> | undefined;
}) {
  const [advanced, setAdvanced] = useState(false);
  const set = (patch: Partial<GenSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className="space-y-5">
      <ModelSelector value={settings.model} onChange={(model) => set({ model })} models={models} />
      <Chips
        label="Aspect ratio"
        options={ASPECT_RATIOS}
        value={settings.ratio}
        onChange={(ratio) => set({ ratio })}
      />
      <Chips
        label="Resolution"
        options={RESOLUTIONS}
        value={settings.resolution}
        onChange={(resolution) => set({ resolution })}
      />
      {showCount ? (
        <Chips
          label="Images"
          options={IMAGE_COUNTS}
          value={settings.count}
          onChange={(count) => set({ count })}
        />
      ) : null}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Style</Label>
        <div className="grid grid-cols-2 gap-2">
          {STYLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set({ style: s })}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all",
                settings.style === s
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <Collapsible open={advanced} onOpenChange={setAdvanced}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-3.5 py-3 text-sm text-foreground transition-colors hover:border-primary/30">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Advanced settings
          </span>
          <ChevronDown className={cn("size-4 transition-transform", advanced && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Negative prompt</Label>
            <Textarea
              placeholder="blurry, low detail, distorted hands"
              rows={2}
              value={settings.negativePrompt}
              onChange={(e) => set({ negativePrompt: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Seed</Label>
              <Input
                placeholder="Random"
                value={settings.seed}
                onChange={(e) => set({ seed: e.target.value.replace(/[^0-9]/g, "") })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Steps</Label>
              <Input defaultValue="30" disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Guidance</Label>
            <Slider defaultValue={[7.5]} min={1} max={20} step={0.5} disabled />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
