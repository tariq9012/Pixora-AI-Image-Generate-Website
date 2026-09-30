import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Seeds reference data only: subscription plans and AI model definitions.
 * Deliberately creates NO user accounts and NO passwords/credentials —
 * per the phase spec, a hardcoded dev admin is exactly the kind of thing
 * that quietly ends up in production. Real users will be created through
 * the real auth flow in a later phase.
 *
 * Idempotent: safe to run multiple times (`onConflictDoNothing` on the
 * natural unique key of each table).
 */
async function main() {
  const databaseUrl = process.env["DATABASE_URL"];

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the database. Check your .env file.");
  }

  if (process.env["NODE_ENV"] === "production") {
    throw new Error("Refusing to run the development seed script against NODE_ENV=production.");
  }

  const client = postgres(databaseUrl, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  console.log("Seeding plans...");
  await db
    .insert(schema.plans)
    .values([
      {
        slug: "free",
        name: "Free",
        description: "Get started with Pixora AI at no cost.",
        priceMonthlyCents: 0,
        priceYearlyCents: 0,
        monthlyCredits: 50,
        features: ["Standard generation", "Limited resolution", "Public creations"],
      },
      {
        slug: "creator",
        name: "Creator",
        description: "For creators who generate regularly.",
        priceMonthlyCents: 1200,
        priceYearlyCents: 12000,
        monthlyCredits: 1000,
        features: ["HD generation", "Image editing", "Private generations", "Faster processing"],
      },
      {
        slug: "pro",
        name: "Pro",
        description: "For professionals who need the best quality.",
        priceMonthlyCents: 2900,
        priceYearlyCents: 29000,
        monthlyCredits: 3500,
        features: ["4K generation", "Advanced models", "Priority generation", "Commercial usage"],
      },
      {
        slug: "enterprise",
        name: "Enterprise",
        description: "Custom plans for teams and organizations.",
        priceMonthlyCents: 0,
        priceYearlyCents: 0,
        monthlyCredits: 0,
        features: ["Team workspace", "Higher limits", "API access", "Priority support"],
      },
    ])
    .onConflictDoNothing({ target: schema.plans.slug });

  console.log("Seeding AI models...");

  // Upsert (not onConflictDoNothing) for ai_models specifically: Phase 6
  // needs to correct the provider/providerModelId Phase 2 seeded as
  // placeholders into a real, working configuration. Keyed by the stable
  // `slug`, and only ever touches the fields below — never a user's or
  // admin's own data — so re-running this is safe.
  const modelSeeds = [
    {
      slug: "pixora-fast",
      name: "Pixora Fast",
      description: "Fast, affordable text-to-image generation.",
      provider: "cloudflare-workers-ai",
      providerModelId: "@cf/black-forest-labs/flux-1-schnell",
      type: "TEXT_TO_IMAGE" as const,
      status: "ACTIVE" as const,
      creditCost: 4,
      supportsTextToImage: true,
      supportsImageToImage: false,
      supportsUpscale: false,
      supportsBackgroundRemoval: false,
      supportsOutpainting: false,
    },
    {
      slug: "pixora-pro",
      name: "Pixora Pro",
      description: "Highest quality Pixora model for final renders.",
      provider: "pixora",
      providerModelId: null,
      type: "TEXT_TO_IMAGE" as const,
      // Not yet connected to a real provider — inactive so it can't be
      // selected for real generation until it is (Phase 6 §7).
      status: "INACTIVE" as const,
      creditCost: 8,
      supportsTextToImage: true,
      supportsImageToImage: true,
      supportsUpscale: true,
      supportsBackgroundRemoval: false,
      supportsOutpainting: false,
    },
    {
      // Phase 7: real Image-to-Image. Distinct slug from the "sdxl"
      // placeholder below — that row is an inactive, unconfigured
      // third-party placeholder and stays that way; this is the actual
      // Cloudflare Workers AI-backed model.
      //
      // Model history (do not re-try any of these without re-reading the
      // file-level comment at the top of cloudflare-workers-ai.server.ts
      // first — all four were verified live against this account):
      //   - stable-diffusion-xl-lightning: img2img fields not actually
      //     implemented by the model's deployed graph (AiError 3030),
      //     confirmed with both `image_b64` and the raw `image` array.
      //   - stable-diffusion-xl-base-1.0: same AiError 3030, same two
      //     input forms — this whole classic-REST SD family appears to
      //     not have img2img wired on Cloudflare despite the docs.
      //   - stable-diffusion-v1-5-img2img: a real img2img model, but this
      //     Cloudflare account isn't entitled to use it (AiError 5018).
      //   - pruna/p-image-edit (Unified Inference API): CONFIRMED WORKING
      //     end to end (base64 data URI accepted, correct response
      //     shape) — the only one of the four that actually functions.
      //     It requires Cloudflare AI Gateway balance/BYOK on this
      //     account, though (AiError 2021, insufficient balance), which
      //     the account holder has chosen not to add for now.
      //
      // INACTIVE until that billing decision changes — deliberately, not
      // a bug. To re-enable once balance/BYOK is set up: flip status back
      // to "ACTIVE" below and rerun `npm run db:seed`. No code changes
      // needed — cloudflare-workers-ai.server.ts is already correct for
      // this model.
      slug: "pixora-image-to-image",
      name: "Pixora Image to Image",
      description: "Transform a reference image with a prompt.",
      provider: "cloudflare-workers-ai",
      providerModelId: "pruna/p-image-edit",
      type: "IMAGE_TO_IMAGE" as const,
      status: "INACTIVE" as const,
      // Development default — adjust once real usage/cost data is
      // available. Pruna's own pricing for p-image-edit is very low
      // (sub-second edits), so this may be worth lowering later.
      creditCost: 6,
      supportsTextToImage: false,
      supportsImageToImage: true,
      supportsUpscale: false,
      supportsBackgroundRemoval: false,
      supportsOutpainting: false,
    },
    {
      slug: "flux",
      name: "Flux",
      description: "Third-party model integration placeholder.",
      provider: "external",
      providerModelId: null,
      type: "TEXT_TO_IMAGE" as const,
      status: "INACTIVE" as const,
      creditCost: 10,
      supportsTextToImage: true,
      supportsImageToImage: true,
      supportsUpscale: false,
      supportsBackgroundRemoval: false,
      supportsOutpainting: false,
    },
    {
      slug: "sdxl",
      name: "SDXL",
      description: "Third-party model integration placeholder.",
      provider: "external",
      providerModelId: null,
      type: "TEXT_TO_IMAGE" as const,
      status: "INACTIVE" as const,
      creditCost: 6,
      supportsTextToImage: true,
      supportsImageToImage: true,
      supportsUpscale: false,
      supportsBackgroundRemoval: false,
      supportsOutpainting: false,
    },
    {
      // Phase 8: real Background Removal via a local (no-billing) ONNX
      // processor — see the file-level comment at the top of
      // src/lib/ai/local/background-removal.server.ts for the full
      // capability/licensing/billing audit that led here (Cloudflare has
      // no native background-removal model at all; the obvious npm/HF
      // alternatives were AGPL-licensed-and-unmaintained or
      // commercial-license-only). `providerModelId` here is a logical
      // label, not a remote API model id — the actual model file
      // (isnet-general-use.onnx, Apache-2.0) is downloaded and cached on
      // disk by that module, not addressed through this string.
      slug: "pixora-background-removal",
      name: "Pixora Background Removal",
      description: "Remove the background from a photo, no prompt needed.",
      provider: "local",
      providerModelId: "isnet-general-use",
      type: "BACKGROUND_REMOVAL" as const,
      status: "ACTIVE" as const,
      // Development default — this runs on your own server's CPU, not a
      // metered third-party API, so there's no real per-call cost to
      // price against yet. Adjust once you have a sense of real compute
      // cost per removal.
      creditCost: 3,
      supportsTextToImage: false,
      supportsImageToImage: false,
      supportsUpscale: false,
      supportsBackgroundRemoval: true,
      supportsOutpainting: false,
    },
    {
      // Phase 9: real Upscale via the same local (no-billing) ONNX
      // approach as Phase 8 — see the file-level comment at the top of
      // src/lib/ai/local/upscale.server.ts for the full capability/
      // license/billing audit. `providerModelId` is a logical label
      // ("real-esrgan"), not a remote API id — the local processor picks
      // between two actual model files (real_esrgan_x2.onnx /
      // real_esrgan_x4.onnx, both BSD-3-Clause) based on the requested
      // factor, both downloaded/cached on disk by that module.
      slug: "pixora-upscale",
      name: "Pixora Upscale",
      description: "Enhance and enlarge a photo 2x or 4x with real super-resolution.",
      provider: "local",
      providerModelId: "real-esrgan",
      type: "UPSCALE" as const,
      status: "ACTIVE" as const,
      // Base cost for 2x; generateUpscale() in generation.server.ts
      // doubles this for the 4x factor (same per-pixel model compute,
      // but a bigger/"premium" output) rather than a second DB row.
      creditCost: 3,
      supportsTextToImage: false,
      supportsImageToImage: false,
      supportsUpscale: true,
      supportsBackgroundRemoval: false,
      supportsOutpainting: false,
    },
    {
      // Phase 10: real Expand/Outpainting via Cloudflare Workers AI's
      // CLASSIC (free-tier) `@cf/runwayml/stable-diffusion-v1-5-inpainting`
      // — see the file-level comment at the top of
      // cloudflare-workers-ai.server.ts's outpaintImage() for the full
      // verification (confirmed live: cf-ai-neurons: 0.00, i.e. genuinely
      // free, and NOT subject to the account restriction that blocked
      // Phase 7's img2img model from the same vendor family). The actual
      // expanded-canvas + mask construction happens locally via sharp
      // (see canvas.server.ts) before this model is ever called — this
      // row only represents the remote inpainting call itself.
      slug: "pixora-expand",
      name: "Pixora Expand",
      description: "Expand a photo's borders with AI-generated surrounding content.",
      provider: "cloudflare-workers-ai",
      providerModelId: "@cf/runwayml/stable-diffusion-v1-5-inpainting",
      type: "OUTPAINT" as const,
      status: "ACTIVE" as const,
      // Development default — this is a real Stable-Diffusion inference
      // call (heavier than flux-1-schnell's 4 steps), so priced above
      // Pixora Fast despite also being on Cloudflare's free tier.
      creditCost: 6,
      supportsTextToImage: false,
      supportsImageToImage: false,
      supportsUpscale: false,
      supportsBackgroundRemoval: false,
      supportsOutpainting: true,
    },
    {
      // Phase 11: real Editor / masked inpainting — reuses the EXACT
      // same Cloudflare Workers AI model and request shape as Phase 10's
      // "pixora-expand" above (`provider.outpaintImage()` is called
      // unchanged for both — see canvas.server.ts's Phase 11 section for
      // why). Kept as a separate model row rather than reusing the
      // pixora-expand row itself so Expand and Editor can be priced,
      // enabled/disabled, and reported on independently, even though
      // they share a provider and providerModelId. Filtered by
      // `type = "EDITOR"` (see listActiveEditorModels in models.server.ts)
      // rather than a new boolean capability flag — `aiModelTypeEnum`
      // already reserved an "EDITOR" value, so this required zero schema
      // migration.
      slug: "pixora-editor",
      name: "Pixora Editor",
      description: "Paint a mask and describe the change — only that area is regenerated.",
      provider: "cloudflare-workers-ai",
      providerModelId: "@cf/runwayml/stable-diffusion-v1-5-inpainting",
      type: "EDITOR" as const,
      status: "ACTIVE" as const,
      // Same underlying compute as Pixora Expand — priced the same.
      creditCost: 6,
      supportsTextToImage: false,
      supportsImageToImage: false,
      supportsUpscale: false,
      supportsBackgroundRemoval: false,
      supportsOutpainting: false,
    },
  ];

  for (const model of modelSeeds) {
    await db
      .insert(schema.aiModels)
      .values(model)
      .onConflictDoUpdate({
        target: schema.aiModels.slug,
        set: {
          name: model.name,
          description: model.description,
          provider: model.provider,
          providerModelId: model.providerModelId,
          type: model.type,
          status: model.status,
          creditCost: model.creditCost,
          supportsTextToImage: model.supportsTextToImage,
          supportsImageToImage: model.supportsImageToImage,
          supportsUpscale: model.supportsUpscale,
          supportsBackgroundRemoval: model.supportsBackgroundRemoval,
          supportsOutpainting: model.supportsOutpainting,
          updatedAt: new Date(),
        },
      });
  }

  console.log("Seed complete.");
  await client.end();
}

main().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
