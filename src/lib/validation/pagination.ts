import { z } from "zod";

/**
 * Example of the pattern future server routes/functions should follow:
 * define the shape once with Zod, reuse it everywhere that input is
 * accepted, and never trust a query/body value without parsing it first.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
