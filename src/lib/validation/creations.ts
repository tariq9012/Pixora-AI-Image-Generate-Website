import { z } from "zod";

import { paginationSchema } from "./pagination";

/** Mirrors `generationTypeEnum` — see db/schema/enums.ts. */
export const operationTypeValues = [
  "TEXT_TO_IMAGE",
  "IMAGE_TO_IMAGE",
  "BACKGROUND_REMOVAL",
  "UPSCALE",
  "OUTPAINT",
  "EDITOR",
] as const;

/** Mirrors `generationStatusEnum`. */
export const historyStatusValues = [
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

const sortValues = ["newest", "oldest"] as const;

/** Bounded max length for search — spec §67 ("Bound maximum search
 * length"). Long enough for any real prompt fragment, short enough to
 * keep the ILIKE scan cheap. */
const MAX_SEARCH_LENGTH = 200;

export const listCreationsSchema = paginationSchema.extend({
  type: z.enum(operationTypeValues).optional(),
  modelId: z.string().uuid().optional(),
  favoritesOnly: z.coerce.boolean().optional().default(false),
  search: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
  /** "Last N days" filter — bounded to 10 years, generous but not
   * unbounded (spec §21: validate filter values server-side). */
  sinceDays: z.coerce.number().int().positive().max(3650).optional(),
  sort: z.enum(sortValues).optional().default("newest"),
});
export type ListCreationsInput = z.infer<typeof listCreationsSchema>;

export const listHistorySchema = paginationSchema.extend({
  type: z.enum(operationTypeValues).optional(),
  status: z.enum(historyStatusValues).optional(),
  modelId: z.string().uuid().optional(),
  sort: z.enum(sortValues).optional().default("newest"),
});
export type ListHistoryInput = z.infer<typeof listHistorySchema>;

export const creationIdSchema = z.object({
  creationId: z.string().uuid("A valid creation is required."),
});
export type CreationIdInput = z.infer<typeof creationIdSchema>;
