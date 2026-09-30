/**
 * PHASE 12: shared view-model types for My Creations + History.
 *
 * Deliberately its own file (no `.server.ts` suffix, no DB imports) so
 * both the server query layer AND the client route components can import
 * the same `OperationType` / `OPERATION_LABELS` / DTO shapes without
 * pulling Drizzle or the Postgres client into the browser bundle.
 */

/** Mirrors `generationTypeEnum` in db/schema/enums.ts exactly. Kept as a
 * plain literal union here (rather than importing the Drizzle enum type)
 * so this file has zero server-only dependencies. */
export type OperationType =
  "TEXT_TO_IMAGE" | "IMAGE_TO_IMAGE" | "BACKGROUND_REMOVAL" | "UPSCALE" | "OUTPAINT" | "EDITOR";

/** Human-readable labels for real generation types — spec §9: "Do NOT
 * infer operation type from filenames or prompt text. Use generation
 * type/model data." Every value shown in the UI traces back to this map
 * keyed off the real `generations.type` column, never a guess. */
export const OPERATION_LABELS: Record<OperationType, string> = {
  TEXT_TO_IMAGE: "Text to Image",
  IMAGE_TO_IMAGE: "Image to Image",
  BACKGROUND_REMOVAL: "Background Removal",
  UPSCALE: "Upscale",
  OUTPAINT: "Expand",
  EDITOR: "AI Editor",
};

/** Mirrors `generationStatusEnum`. */
export type HistoryStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";

export const STATUS_LABELS: Record<HistoryStatus, string> = {
  QUEUED: "Queued",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export type UsedModel = {
  id: string;
  name: string;
};

export type CreationListItem = {
  id: string;
  /** Real title if the row has one, else a safe fallback (truncated
   * prompt, else the operation label) — never an invented string. See
   * queries.server.ts's `resolveTitle`. */
  title: string;
  imageUrl: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  operationType: OperationType | null;
  operationLabel: string;
  modelName: string | null;
  prompt: string | null;
  isFavorite: boolean;
};

export type CreationListResult = {
  items: CreationListItem[];
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
};

export type HistoryListItem = {
  id: string;
  status: HistoryStatus;
  operationType: OperationType;
  operationLabel: string;
  modelName: string | null;
  prompt: string | null;
  createdAt: string;
  completedAt: string | null;
  /** Net of any refund — see history.server.ts's ledger-based
   * computation. 0 for a fully-refunded generation. */
  creditsUsed: number;
  wasRefunded: boolean;
  /** Already-safe message straight from the generation's own stored
   * `errorMessage` (every write path in generation.server.ts only ever
   * stores a GenerationError's user-facing `.message`, never a raw
   * exception/stack trace) — never re-derived or guessed here. */
  errorMessage: string | null;
  outputImageUrl: string | null;
  creationId: string | null;
};

export type HistoryListResult = {
  items: HistoryListItem[];
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
};
