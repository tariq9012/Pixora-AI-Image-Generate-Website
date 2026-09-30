import { ImagePlus, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function PromptComposer({
  value,
  onChange,
  onGenerate,
  cost,
  busy,
  placeholder = "Describe your image...",
  ctaLabel = "Generate",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onGenerate: () => void;
  cost: number;
  busy?: boolean;
  placeholder?: string;
  ctaLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-3 shadow-soft transition-colors focus-within:border-primary/50",
        className,
      )}
    >
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="resize-none border-0 bg-transparent p-2 text-base shadow-none focus-visible:ring-0"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange(
                    `${value.trim() || "A portrait"} — cinematic lighting, 85mm lens, ultra-detailed, editorial colour grade`,
                  );
                  toast.success("Prompt enhanced");
                }}
              >
                <Wand2 className="size-4" /> Enhance
              </Button>
            </TooltipTrigger>
            <TooltipContent>Rewrite the prompt with richer detail</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toast.info("Reference image attached (demo)")}
              >
                <ImagePlus className="size-4" /> Attach
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach a reference image</TooltipContent>
          </Tooltip>
        </div>
        <Button onClick={onGenerate} disabled={busy} className="min-w-[172px]">
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Generating...
            </>
          ) : (
            <>
              <Sparkles className="size-4" /> {ctaLabel} · {cost} credits
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
