import { AlertCircle, ImageUp, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { UploadStatus } from "./use-asset-upload";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

export function UploadArea({
  title = "Upload Reference Image",
  preview,
  status = "idle",
  error,
  onFileSelected,
  onRemove,
  className,
  // Purely a label — the real limit is enforced server-side per asset
  // purpose in src/lib/storage/validation.ts. Defaults to 20 to match
  // that file's limit for every purpose except Image-to-Image's 8MB.
  maxSizeMb = 20,
}: {
  title?: string;
  preview: string | null;
  status?: UploadStatus;
  error?: string | null;
  onFileSelected: (file: File) => void;
  onRemove: () => void;
  className?: string;
  maxSizeMb?: number;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => inputRef.current?.click();

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFileSelected(file);
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPTED_TYPES}
      className="hidden"
      onChange={(e) => {
        handleFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  if (preview) {
    return (
      <div className={cn("relative overflow-hidden rounded-2xl border border-border", className)}>
        {fileInput}
        <img
          src={preview}
          alt="Uploaded reference"
          className={cn(
            "max-h-[420px] w-full object-cover transition-opacity",
            status === "uploading" && "opacity-50",
          )}
        />
        {status === "uploading" ? (
          <div className="absolute inset-0 grid place-items-center bg-background/30">
            <Loader2 className="size-6 animate-spin text-foreground" />
          </div>
        ) : null}
        <Button
          variant="secondary"
          size="icon"
          aria-label="Remove image"
          className="absolute right-3 top-3"
          onClick={onRemove}
        >
          <X className="size-4" />
        </Button>
        {status === "error" && error ? (
          <p className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-destructive/90 px-3 py-2 text-xs text-destructive-foreground">
            <AlertCircle className="size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {fileInput}
      <button
        type="button"
        onClick={openPicker}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-all",
          dragging
            ? "border-primary bg-primary/10"
            : "border-border bg-card/50 hover:border-primary/50 hover:bg-card",
          className,
        )}
      >
        <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-border bg-background">
          <ImageUp className="size-6 text-primary" />
        </div>
        <p className="font-display text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Drag and drop an image or browse your files
        </p>
        <p className="mt-3 text-xs text-muted-foreground/70">
          PNG, JPG or WEBP · up to {maxSizeMb} MB
        </p>
        {error ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="size-3.5" />
            {error}
          </p>
        ) : null}
      </button>
    </div>
  );
}
