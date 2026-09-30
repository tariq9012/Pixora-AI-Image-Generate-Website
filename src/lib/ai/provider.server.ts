import { GenerationError } from "./errors.server";
import { createCloudflareWorkersAiProvider } from "./providers/cloudflare-workers-ai.server";
import { createLocalProcessor } from "./providers/local.server";
import { createReplicateProvider } from "./providers/replicate.server";
import type { AiProvider } from "./types";

let cached: AiProvider | undefined;
let cachedName: string | undefined;

/**
 * `dbProviderName` comes from the `ai_models.provider` column for the
 * model actually being used — not a global app-wide setting — so
 * different models can use different providers without touching this
 * factory's call sites.
 */
export function getAiProvider(dbProviderName: string): AiProvider {
  if (cached && cachedName === dbProviderName) return cached;

  if (dbProviderName === "replicate") {
    cached = createReplicateProvider();
  } else if (dbProviderName === "cloudflare-workers-ai") {
    cached = createCloudflareWorkersAiProvider();
  } else if (dbProviderName === "local") {
    cached = createLocalProcessor();
  } else {
    throw new GenerationError(
      "MODEL_NOT_AVAILABLE",
      "This model isn't connected to a real AI provider yet.",
    );
  }

  cachedName = dbProviderName;
  return cached;
}
