import { z } from "zod";

/**
 * Server-only environment access. The `.server.ts` suffix (see
 * eslint.config.js's `no-restricted-imports` note) makes TanStack Start's
 * build-time import-protection reject this module if a client component
 * ever tries to import it, so secrets can't leak into the browser bundle.
 *
 * Every variable a *future* phase will need (AI provider keys, storage,
 * Stripe) is declared here as optional now so adding real values later
 * never requires touching this file's shape — only `DATABASE_URL` is
 * required today.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL is required (see .env.example).")
      .refine(
        (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
        "DATABASE_URL must be a postgres:// or postgresql:// connection string.",
      ),

    // Both optional: when RESEND_API_KEY is unset, src/lib/email/client.server.ts
    // falls back to logging emails to the server console instead of sending
    // them — auth flows (verify email, reset password) work fully without
    // real email credentials configured.
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    APP_URL: z
      .string()
      .optional()
      .default("http://localhost:5173")
      .describe("Base URL used to build links in emails (verify-email, reset-password)."),

    // --- AI generation (Phase 6) ---
    // Optional on purpose: with no token set, the app still boots and
    // Studio still renders — generation requests just fail cleanly with
    // AI_NOT_CONFIGURED instead of the app crashing or faking a result.
    AI_PROVIDER: z.enum(["replicate", "cloudflare-workers-ai"]).default("cloudflare-workers-ai"),
    REPLICATE_API_TOKEN: z.string().optional(),
    // Workers AI-scoped token — separate from Phase 5's S3_* R2 credentials,
    // which authenticate to R2's S3-compatible API, not this one.
    CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
    CLOUDFLARE_API_TOKEN: z.string().optional(),

    // --- Billing (Phase 13) ---
    // All optional: with no secret key set, the billing UI still renders —
    // Checkout/Portal buttons show a clear "not configured" state instead
    // of the app crashing or faking a payment (spec §2). Hosted Checkout is
    // used throughout (redirect to the URL Stripe returns), so no
    // publishable key / client-side Stripe.js is needed.
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    // Real Stripe Price IDs, configured per plan+interval (spec §14/§15:
    // "Store/configure Price IDs server-side", never trust one from the
    // client). A plan/interval combination with no Price ID configured is
    // simply unavailable for self-serve Checkout — Enterprise is expected
    // to stay contact-sales and never gets one.
    STRIPE_PRICE_CREATOR_MONTHLY: z.string().optional(),
    STRIPE_PRICE_CREATOR_YEARLY: z.string().optional(),
    STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
    STRIPE_PRICE_PRO_YEARLY: z.string().optional(),
    // Credit packs (one-time purchases) use inline Stripe `price_data`
    // instead of pre-created Price objects — see
    // billing/credit-packs.ts's doc comment for why that's a deliberate,
    // spec-sanctioned choice (§15) rather than a shortcut. This is the one
    // currency used for that inline pricing; subscriptions get their
    // currency from whatever each configured Stripe Price ID was created
    // with.
    STRIPE_CREDIT_PACK_CURRENCY: z.string().optional().default("usd"),
    // --- Storage (Phase 5) ---
    // "local" writes to storage/dev/ on this machine's disk — development
    // only, see src/lib/storage/providers/local.server.ts. "s3" talks to any
    // S3-compatible bucket (Cloudflare R2, AWS S3, Backblaze B2, ...) via
    // src/lib/storage/providers/s3.server.ts.
    STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    // Public base URL for objects in the bucket (a custom domain, or the
    // provider's public bucket URL) — used to build AVATAR/PROJECT_COVER
    // URLs directly without a signed request.
    S3_PUBLIC_BASE_URL: z.string().optional(),

    // --- Production hardening (Phase 14) ---
    // Local ONNX tools (Background Removal, Upscale) need a persistent Node
    // process with a writable disk, native onnxruntime-node/sharp binaries
    // and several hundred MB of RAM. That is NOT true of Vercel Functions.
    // Default: enabled outside production, DISABLED in production unless
    // explicitly set to "true" (e.g. on a VPS/container that really runs them).
    LOCAL_ONNX_ENABLED: z.enum(["true", "false"]).optional(),
    // Max multipart body the upload route will accept through the app server.
    // Vercel Functions reject request bodies above ~4.5 MB before our code
    // runs, so the production default stays under that. Larger files need the
    // direct-to-R2 upload flow (see docs/PRODUCTION.md).
    UPLOAD_PROXY_MAX_BYTES: z.coerce.number().int().positive().optional(),
    // postgres.js pool size per server instance. Default keeps the existing
    // behavior (10 in production, 3 in development). On serverless, every warm
    // instance opens its own pool, so total connections = instances x this
    // value — lower it (e.g. 3) if Neon reports too many connections.
    DB_POOL_MAX: z.coerce.number().int().min(1).max(20).optional(),

    // --- Stale-generation cleanup (Phase 14B) ---
    // Shared secret for machine-to-machine cron endpoints. Vercel Cron sends
    // it as `Authorization: Bearer <CRON_SECRET>`. Server-only (no VITE_).
    CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 characters.").optional(),
    // A PROCESSING generation (or QUEUED, by created_at) older than this many
    // minutes is considered stranded. Default 15; bounded so a typo cannot
    // fail live jobs (min) or leave credits stuck for a day (max).
    GENERATION_STALE_MINUTES: z.coerce.number().int().min(5).max(240).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.RESEND_API_KEY && !value.EMAIL_FROM) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["EMAIL_FROM"],
        message: "EMAIL_FROM is required when RESEND_API_KEY is set.",
      });
    }

    // Fail at boot, not on the first upload request.
    if (value.NODE_ENV === "production" && value.STORAGE_PROVIDER !== "s3") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STORAGE_PROVIDER"],
        message:
          'STORAGE_PROVIDER must be "s3" in production — the local filesystem fallback is development-only and does not persist across deployments.',
      });
    }

    if (value.NODE_ENV === "production") {
      // Links in emails and Stripe return URLs are built from APP_URL, so a
      // production deployment must never point at localhost or plain HTTP.
      let appUrl: URL | null = null;
      try {
        appUrl = new URL(value.APP_URL);
      } catch {
        appUrl = null;
      }
      if (
        !appUrl ||
        appUrl.protocol !== "https:" ||
        /^(localhost|127\.|0\.0\.0\.0)/.test(appUrl.hostname)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["APP_URL"],
          message:
            "APP_URL must be the public https:// origin in production (not localhost / http).",
        });
      }

      // Password-reset and verification links must really be delivered.
      if (!value.RESEND_API_KEY || !value.EMAIL_FROM) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["RESEND_API_KEY"],
          message:
            "RESEND_API_KEY and EMAIL_FROM are required in production (no console email fallback).",
        });
      }

      // The cleanup cron endpoint must never be reachable without a secret.
      if (!value.CRON_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CRON_SECRET"],
          message:
            "CRON_SECRET is required in production (protects /api/cron/cleanup-generations; min 32 chars).",
        });
      }

      // Billing, when enabled, must be able to verify webhooks.
      if (value.STRIPE_SECRET_KEY && !value.STRIPE_WEBHOOK_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["STRIPE_WEBHOOK_SECRET"],
          message: "STRIPE_WEBHOOK_SECRET is required in production when STRIPE_SECRET_KEY is set.",
        });
      }
    }

    if (value.STORAGE_PROVIDER === "s3") {
      const requiredS3Vars = [
        "S3_ENDPOINT",
        "S3_REGION",
        "S3_BUCKET",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "S3_PUBLIC_BASE_URL",
      ] as const;

      for (const key of requiredS3Vars) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_PROVIDER=s3.`,
          });
        }
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // A blank line in .env (e.g. "STORAGE_PROVIDER=" with nothing after the
  // `=`) parses as an empty string, not `undefined` — which would silently
  // skip the schema's `.default(...)` and fail validation with a
  // confusing "invalid enum value" error instead of just using the
  // default. Treat "" the same as "not set" everywhere.
  const rawEnv = Object.fromEntries(
    Object.entries(process.env).map(([key, value]) => [key, value === "" ? undefined : value]),
  );

  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    // Fail loudly and immediately on boot rather than letting `undefined`
    // silently flow into the database client and surface as a confusing
    // connection error later.
    throw new Error(
      `Invalid or missing environment variables:\n${formatted}\n\n` +
        "Copy .env.example to .env and fill in the required values.",
    );
  }

  return parsed.data;
}

export const env = loadEnv();
