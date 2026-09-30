import { z } from "zod";

import { paginationSchema } from "./pagination";

export const creditPackCheckoutSchema = z.object({
  packSlug: z.string().min(1, "A credit pack is required."),
});
export type CreditPackCheckoutInput = z.infer<typeof creditPackCheckoutSchema>;

export const subscriptionCheckoutSchema = z.object({
  planSlug: z.string().min(1, "A plan is required."),
  interval: z.enum(["MONTHLY", "YEARLY"]),
});
export type SubscriptionCheckoutInput = z.infer<typeof subscriptionCheckoutSchema>;

export const listPaymentsSchema = paginationSchema;
export type ListPaymentsInput = z.infer<typeof listPaymentsSchema>;
