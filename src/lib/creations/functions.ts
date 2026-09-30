import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth/guards.server";
import {
  creationIdSchema,
  listCreationsSchema,
  listHistorySchema,
} from "@/lib/validation/creations";

import { listUserGenerationHistory } from "./history.server";
import {
  CreationNotFoundError,
  listUserCreations,
  listUserUsedModels,
  softDeleteCreationForUser,
  toggleFavoriteForUser,
} from "./queries.server";

// All five functions below derive the user ID from the authenticated
// session via `requireUser()` — never from client input (spec §5, §43).
// `requireUser()` itself redirects/throws for an unauthenticated request,
// which is what makes the logout->direct-visit test (spec §73) work: the
// route's own `beforeLoad` guard blocks the page shell, and even if that
// were ever bypassed, these functions independently refuse to run
// without a real session.

export const listCreationsFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => listCreationsSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    return listUserCreations(user.id, data);
  });

export const listHistoryFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => listHistorySchema.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    return listUserGenerationHistory(user.id, data);
  });

/** Powers the "Model" filter dropdown on both pages with models the
 * current user has actually used — see listUserUsedModels's doc comment. */
export const listUsedModelsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return listUserUsedModels(user.id);
});

export type ToggleFavoriteResult =
  { success: true; isFavorite: boolean } | { success: false; message: string };

export const toggleFavoriteFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => creationIdSchema.parse(input))
  .handler(async ({ data }): Promise<ToggleFavoriteResult> => {
    const user = await requireUser();
    try {
      const result = await toggleFavoriteForUser(user.id, data.creationId);
      return { success: true, ...result };
    } catch (error) {
      // Same safe, generic message whether the creation genuinely
      // doesn't exist or belongs to someone else — spec §44: a user
      // guessing another user's creation ID must not be able to tell
      // the difference between "not found" and "not yours".
      if (error instanceof CreationNotFoundError) {
        return { success: false, message: "Creation not found." };
      }
      console.error("Failed to toggle favorite:", error);
      return { success: false, message: "Something went wrong. Please try again." };
    }
  });

export type DeleteCreationResult = { success: true } | { success: false; message: string };

export const deleteCreationFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => creationIdSchema.parse(input))
  .handler(async ({ data }): Promise<DeleteCreationResult> => {
    const user = await requireUser();
    try {
      await softDeleteCreationForUser(user.id, data.creationId);
      return { success: true };
    } catch (error) {
      if (error instanceof CreationNotFoundError) {
        return { success: false, message: "Creation not found." };
      }
      console.error("Failed to delete creation:", error);
      return { success: false, message: "Something went wrong. Please try again." };
    }
  });
