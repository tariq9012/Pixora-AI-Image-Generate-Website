# Pixora AI — Phase 14: Production readiness, security & deployment

**Verdict: NOT READY FOR PRODUCTION** (see "Unresolved blockers").

Verification scope: this phase was done as a static audit + code changes in
an environment with **no network access and no `node_modules`**. `npm install`,
`npm run build`, `npm run lint`, `npm run typecheck`, `npm audit`, `npm outdated`,
the bundle scans and every runtime/security test (items 45, 66, 75-80) were
**NOT run** and are listed under "Verification you must run". A syntax-level
TypeScript check of every changed file passed; full type-checking could not run.

## 1. Audit findings

### Critical (deployment / security blockers)
| # | Finding | Status |
|---|---------|--------|
| C1 | Background Removal + Upscale run local ONNX (`onnxruntime-node`, `sharp`, ~170MB+ models downloaded from GitHub at runtime into `./.cache` under the project dir). On Vercel: project dir is read-only, model download per cold start, huge native bundle, high CPU/RAM/duration. Not supportable. | **Mitigated, not solved.** Tools are now capability-gated (`LOCAL_ONNX_ENABLED`, off by default in production): lists are empty, request fails before credits are reserved. Real inference host still needed (Option A below). |
| C2 | `onnxruntime-node` was imported statically by the shared generation module: any runtime that could not load the native addon would crash Text-to-Image/Expand/Editor too. | **Fixed** (lazy `loadOrt()`). |
| C3 | The real `.env` (live Neon URL, Stripe test key + webhook secret, Resend key, R2 keys, Cloudflare token) was inside the uploaded zip. No `.git` folder was present, so history could not be audited. | **Action needed by you:** rotate all of them if the zip/repo was ever shared or committed. Removed from the delivered zip. |
| C4 | `vite.config.ts` had no Nitro plugin although `nitro` is a devDependency; a plain `vite build` output (`dist/server/server.js`) is not a Vercel deployment. | **Configured, unverified:** `nitro()` is enabled only for Vercel builds / `--mode vercel`. Must be verified with a real Vercel build. |
| C5 | Uploads go browser -> app server -> R2 with limits up to 20MB; Vercel rejects request bodies above ~4.5MB. | **Not solved.** Production now returns a clear 413 above 4MB (`UPLOAD_PROXY_MAX_BYTES`). Direct-to-R2 (presigned) upload is still required for normal phone photos. It needs bucket CORS + real R2 credentials to verify, so it was deliberately not shipped untested. |

### High
| # | Finding | Status |
|---|---------|--------|
| H1 | `listActiveImageToImageModels` and `listActiveBackgroundRemovalModels` had **no `.where()`** (returned every model row, active or not). | **Fixed.** |
| H2 | No security headers, no CSP. | **Fixed** (see section 4). |
| H3 | `POST /api/assets/upload` had no origin/CSRF check (server functions are covered by `createCsrfMiddleware`, raw routes are not). | **Fixed** (`isSameOriginRequest`; SameSite=Lax was the only protection). |
| H4 | Console email fallback would print live verification/reset links in production logs; production could "work" with no email. | **Fixed:** production refuses to boot without Resend config; sender throws instead of logging. |
| H5 | Generation refund was check-then-insert (race -> possible double refund). | **Fixed in code; migration required** (partial unique index, see section 3). |
| H6 | No timeout on Cloudflare Workers AI calls; a hung call after credit reservation can outlive the function and never reach the refund path. | **Fixed:** 90s `AbortSignal.timeout`. Set Vercel `maxDuration` above it. |
| H7 | Stale `PROCESSING` generations (function killed mid-run) are never reconciled/refunded. | **Open.** Needs a scheduled reconciler (cron) that fails PROCESSING rows older than N minutes and calls `refundCreditsIfNotAlready`. |
| H8 | `GENERATED_OUTPUT`/avatars/covers are "public" URLs while inputs live in the same bucket; making the bucket public exposes private inputs by key. | **Open (config).** Use two buckets, or a custom domain/WAF rule that only serves `users/*/outputs/*` and avatars/projects. Never enable the raw `r2.dev` public URL on the bucket holding inputs. |
| H9 | Rate limiter is per-instance memory; keyed by email only (no IP). | **Documented.** Financial safety does not depend on it (see section 6). Sweep added to bound memory. |
| H10 | Public avatars/covers kept phone EXIF (GPS). | **Fixed:** re-encoded without metadata, orientation normalized first, ICC kept. |

### Medium
- Signup reveals "email already exists"; login has a timing difference for unknown emails (no dummy bcrypt). Accepted/typical; note for later.
- Login/forgot rate limits are keyed by submitted email only: an attacker can lock out a victim's login for 15 minutes. Add IP + email keys with a shared store.
- Private-asset `assets.url` stores a 1-hour signed URL at upload time (expires); server-side reads don't use it, but UI previews of old private inputs may break. Not verified in UI.
- Cloudflare provider logs the upstream error body; sanitized/truncated logging recommended (no tokens are in the body, but payloads can be large).
- `password reset` consumes the token before updating the password (a DB failure between the two burns the link). Low impact.
- Expired session rows are only deleted when presented; add a periodic purge.
- `/api/assets/local/*` serves any file under `storage/dev` without an ownership check. Dev-only (404 unless `STORAGE_PROVIDER=local`, and production refuses `local`), unguessable UUID paths.
- Admin routes (`admin.*`) were not audited for real data access/authorization (they appear to be UI shells).
- Download routes: no dedicated download route was found; downloads use asset URLs. Content-Disposition/filename injection was therefore not applicable, but not runtime-tested.

### Low
- Redundant `vite-tsconfig-paths`: intentionally NOT removed (can't verify build). To try: in `vite.config.ts` remove the `tsConfigPaths(...)` line and its import, set `resolve: { tsconfigPaths: true, dedupe: [...] }`, then run `npm run build` and `npm run dev`; revert if either fails.
- `chart.tsx` uses `dangerouslySetInnerHTML` for a `<style>` built from developer-supplied chart config (no user data). Only other rendered user fields go through React escaping.
- Client `reportError` is console-only; no server-side structured logger/monitoring integration yet.

## 2. Verified OK (by reading the code)
- Passwords: bcryptjs, 12 rounds, server-side, 72-byte cap enforced in validation. Generic login errors.
- Sessions: 256-bit random token, only SHA-256 hash stored, HttpOnly cookie, `Secure` in production, `SameSite=Lax`, Path `/`, 30-day expiry, logout deletes the row, password reset kills all sessions, password change kills other sessions, BANNED/SUSPENDED blocked on every request. No token in localStorage.
- Reset/verification tokens: 256-bit random, hashed at rest, single-use with atomic `consumedAt IS NULL` update, 45 min / 24 h expiry, reissue invalidates older tokens, forgot-password never reveals whether an account exists.
- Open redirects: none. No `returnTo`/`redirect` input; Stripe success/cancel/portal URLs are built only from `APP_URL`.
- SQL injection: Drizzle parameterization everywhere; the `sql` fragments interpolate column refs/numbers only.
- SSRF: the only server `fetch` of a URL is the provider-output download (URL from the provider response, now https-only and blocks literal internal hosts) and the fixed model URLs. No user-supplied URLs.
- Path traversal: storage keys are `users/<uuid>/<purpose>/<yyyy>/<mm>/<uuid>.<ext>` with a magic-byte-derived extension; the local serve route also rejects `..` and re-checks the resolved root.
- Upload validation: magic bytes via `file-type`, declared-MIME mismatch rejected, SVG never accepted, size caps per purpose, 8000px / 40MP dimension caps read from headers before any decoding.
- Asset authorization: `getAssetBufferForUser` / `deleteAssetForUser` / `setUserAvatarFromAsset` compare owner server-side and return the same error for missing vs foreign assets.
- Credits: only server code mutates balances; reservation is an atomic `UPDATE ... WHERE balance >= amount` inside the same `tx` as the generation row (the old global-`db`-inside-transaction bug is NOT present); Stripe grants are unique per payment (`credit_transactions_payment_id_unique_idx`).
- Stripe: raw-body signature verification, persistent event dedupe (`stripe_webhook_events`), non-2xx on processing failure, 400 on bad signature, server-side pack/price resolution, user from session, Billing Portal user-scoped, credits only from webhook. **Added:** event `livemode` must match the key mode.
- Prompt bounds: all prompts capped at 2000 chars, mask 15M chars, Editor/Expand/Upscale inputs validated as UUIDs owned by the user.

## 3. Schema / migration
`src/db/schema/credits.ts` gained one partial unique index. Generate it with your normal flow and **inspect the SQL before applying**:

```
npm run db:generate
```
Expected SQL (review; there must be no `DROP TYPE`, no `DROP TABLE`):
```sql
CREATE UNIQUE INDEX "credit_transactions_generation_refund_unique_idx"
  ON "credit_transactions" USING btree ("generation_id")
  WHERE "credit_transactions"."type" = 'REFUND';
```
Pre-check for existing duplicate refunds (the index cannot be created if any exist — reconcile them by hand, never bulk-delete ledger rows):
```sql
SELECT generation_id, count(*) FROM credit_transactions
WHERE type = 'REFUND' GROUP BY 1 HAVING count(*) > 1;
```
Then `npm run db:migrate`. The application code is safe both before and after the migration.
No other index changes were justified: sessions (token hash unique, user, expiry), users (email/username/stripe unique), generations/creations/favorites/credit_transactions/payments/subscriptions/webhook events already have the lookup indexes their queries use.

## 4. Security headers / CORS
Applied to every response in `src/server.ts`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geolocation/payment/usb off), `X-Frame-Options: DENY`. Production adds `Content-Security-Policy` and `Strict-Transport-Security`.
CSP (production): `default-src 'self'`; `script-src 'self' 'unsafe-inline'` (TanStack Start inline hydration scripts — no `unsafe-eval`; nonce/hash policy is a follow-up); `style-src 'self' 'unsafe-inline' fonts.googleapis.com`; `font-src 'self' data: fonts.gstatic.com`; `img-src 'self' data: blob:` + your R2 public/endpoint origins; `connect-src 'self'` + R2 origins; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `upgrade-insecure-requests`. Stripe uses hosted-page redirects only, so no Stripe origin is allowed. If you later embed Stripe.js, add `js.stripe.com`.
CORS: no CORS headers exist anywhere and none were added (same-origin only).
Headers were **not tested against a running deployment** — after deploying: `curl -sI https://<domain>/ | grep -iE "content-security|strict-transport|nosniff|referrer|permissions|x-frame"`, then click through login, Studio, uploads and an R2-hosted image to confirm nothing is blocked (browser console CSP errors).

## 5. Neon strategy
Driver: `postgres` (postgres.js) with `prepare: false`, `max` 10 (prod) / 3 (dev), idle 20s, lifetime 30min, direct (non-pooler) connection, `withDbRetry` for dropped connections. **Do not switch to `-pooler` casually** (that is what produced the earlier `CONNECTION_CLOSED` failures around long AI calls). On Vercel every warm instance holds its own pool, so connections = instances x `max`; use `DB_POOL_MAX=3` initially and watch Neon's connection count. Any change to the connection string/driver requires the full regression: signup -> generation (row + credit reservation + ledger in one tx) -> forced provider failure -> single refund -> concurrent generation with a 1-generation balance.

## 6. Rate limiting & financial safety
Limiter is in-memory per instance (login 10/15 min per email, signup 5/h, forgot-password 3/h, resend 3/15 min, generation 20/h per user, upload 30/h per user, checkout/portal 8/min per user). Not reliable across serverless instances; no external store was added. Money/credit correctness does NOT rely on it: atomic conditional balance UPDATE, `payment_id` unique ledger index, Stripe event-id unique index, and (after the migration) unique refund per generation.

## 7. Local ONNX decision (Background Removal, Upscale)
Status: **production blocker, honestly reported, not faked.** In production the tools show as unavailable (empty model lists; server rejects before reserving credits) unless `LOCAL_ONNX_ENABLED=true`.
Recommended: **Option A** — run these two tools on a small persistent Node service (container/VPS, 2-4 vCPU, 4GB+ RAM, writable `LOCAL_MODEL_CACHE_DIR`, models pre-baked into the image) behind:
- auth: shared bearer secret or signed short-lived JWT, HTTPS only, IP allow-list if possible;
- input transfer: Pixora sends the user's asset *storage key + a presigned GET URL* (never a public URL); output is PUT to a presigned R2 URL or returned as bytes;
- limits: body <= 20MB, one job per request, concurrency cap (queue), 5-minute inference timeout, 429 when busy;
- credits: Pixora reserves credits first, calls the service with a timeout, and on any non-success runs the existing exactly-once refund;
- retries: at most one retry on network failure, none after the service accepted the job.
Option B (managed provider) needs your licensing/cost approval. Option C (disable) is the current safe default.

## 8. Vercel / TanStack Start
- `npm run build:vercel` (or Vercel's own build) enables the Nitro plugin; Vercel auto-detects the preset. **Unverified.**
- Set function max duration >= 120s for AI routes (and confirm your Vercel plan/Fluid compute allows it). Cloudflare calls time out at 90s.
- `sharp` works on Vercel (prebuilt linux binaries) — it is used by Expand/Editor. Watch the function bundle size; `onnxruntime-node` is now only loaded lazily but Nitro may still trace and ship its binaries. If the deployed function exceeds Vercel's size limit, mark it external / move ONNX to the inference service and remove the dependency from the Vercel build.
- Source maps: Vite emits none by default (`build.sourcemap` unset). If you enable them for monitoring, upload them privately instead of serving them publicly.

## 9. Environments
| Variable group | Development | Preview | Production |
|---|---|---|---|
| `DATABASE_URL` | dev Neon branch | dedicated preview branch (never prod) | production branch |
| Stripe keys/prices/webhook | test | **test only** | live (or test until launch) |
| `STORAGE_PROVIDER`, `S3_*` | `local` (or dev bucket) | separate bucket or prefix | production bucket(s) |
| `RESEND_*`, `EMAIL_FROM` | blank (console fallback) | test sender | verified domain |
| `CLOUDFLARE_*` | dev token | limited token | production token |
| `APP_URL` | `http://localhost:5173` | preview URL | `https://<domain>` |
| `LOCAL_ONNX_ENABLED` | default (on) | unset (off) | unset (off) unless a real host |
Scope Vercel variables per environment; do not copy production secrets to Preview. Mark all as "Sensitive".

## 10. Migration, backup, monitoring
- Never run migrations from function invocations. Flow: review SQL -> create a Neon restore point/branch -> run `npm run db:migrate` once against production from your machine or CI -> deploy an application version compatible with both schemas.
- Neon backups/PITR depend on your plan and retention; **not verified here**. Create a branch before every production migration.
- Minimum monitoring: 5xx rate, `/api/ready`, failed generations, refund failures (log line "processing failed"/refund errors), Stripe webhook failures (Dashboard + non-2xx), DB connection errors (`CONNECTION_CLOSED`), provider 401/403/429/5xx. Wire an error tracker at `src/lib/error-reporting.ts` (client) and a server logger when approved (no paid service was added).
- Stripe: create a real Dashboard webhook endpoint `https://<domain>/api/stripe/webhook` (events: the ones handled in `webhooks.server.ts`); the CLI is dev-only. Run a Test Clock renewal simulation before enabling live subscriptions.

## 11. Feature matrix
| Feature | Local Dev | Vercel Production | External service needed | Status |
|---|---|---|---|---|
| Auth (sessions, verify, reset) | Works | Works | — | Ready (rate limiting per-instance) |
| Neon Postgres | Works | Works | Neon | Ready (tune `DB_POOL_MAX`) |
| Email | Console fallback | Resend required (boot check) | Resend + verified domain | Needs config |
| Uploads | Works (<=20MB) | Capped at 4MB | R2 | **Blocked for large photos** (C5) |
| R2 storage | Works if configured | Required | Cloudflare R2 | Not verified in this phase |
| Text-to-Image | Works | Works | Cloudflare Workers AI | Ready pending timeout/maxDuration config |
| Background Removal | Works | **Unavailable (gated)** | Inference host | **Blocked** (C1) |
| Upscale | Works | **Unavailable (gated)** | Inference host | **Blocked** (C1) |
| Expand | Works | Works (sharp + Workers AI) | Cloudflare Workers AI | Ready pending build verification |
| Editor | Works | Works (sharp + Workers AI) | Cloudflare Workers AI | Ready pending build verification |
| My Creations / History / Favorites | Works | Works | — | Ready |
| Stripe (packs, subs, portal) | Works (CLI) | Works | Dashboard webhook | Needs endpoint + Test Clock |

## 12. Unresolved blockers (why this is NOT READY FOR PRODUCTION)
1. C1 local ONNX tools have no production inference host (gated off).
2. C5 uploads above ~4MB cannot work on Vercel until direct-to-R2 upload is built and verified.
3. C4 Vercel/Nitro build unverified.
4. H7 no reconciliation of generations stranded in PROCESSING.
5. H8 bucket exposure design (public outputs vs private inputs) must be settled.
6. Secrets in the uploaded `.env` must be rotated if they were ever shared/committed.
7. Nothing in this phase was built, linted, audited (`npm audit`) or runtime-tested.

## 13. Verification you must run
```
npm install
npm run typecheck
npm run lint
npm run build
npm run build:vercel        # verifies the Nitro/Vercel path
npm audit                   # report only; never `npm audit fix --force`
npm outdated                # report only
```
After `npm run build`: `grep -rEl "sk_(test|live)_|whsec_|postgres(ql)?://|CLOUDFLARE_API_TOKEN|S3_SECRET" dist/client` must list nothing, and `grep -rl onnxruntime dist/client` must list nothing.
Manual security tests to run and record: unauthenticated protected routes; wrong password; suspended user; logout; password change; cross-user asset/creation/favorite/delete/download IDs; tampered pack slug/plan/interval; success-page visit without payment; bad webhook signature (expect 400); duplicate webhook (expect 200 skipped); insufficient credits; double-click generation; forced provider failure (single refund); 10MB and renamed `.exe` as `.png` uploads; concurrent generations with exactly one generation of credit.

---

# Phase 14A — Direct-to-R2 uploads

**Status: implemented, NOT yet verified against a real R2 bucket or a real Vercel deployment.**
Nothing below has been run end-to-end; see "Manual test procedure".

## Why
Vercel Functions reject request bodies above ~4.5 MB before our code runs, but Pixora accepts
images up to 20 MB (8 MB for Image-to-Image, 5 MB avatars). In S3/R2 mode the browser therefore
uploads straight to R2 and only small JSON requests go through Vercel.

## Previous flow (still used when `STORAGE_PROVIDER=local`)
`useAssetUpload` -> `POST /api/assets/upload` (multipart) -> `uploadAsset()` (validate, strip EXIF for
public purposes, write to storage, insert `assets` row) -> `{ asset }`.

## New flow (`STORAGE_PROVIDER=s3`, i.e. R2)
1. **Authorize** — `createUploadIntentFn` (server function, session user only). Input: purpose,
   filename, MIME type, size. Checks: purpose allowlist, MIME in {jpeg, png, webp}, declared size vs
   per-purpose limit, rate limit (30/h), at most 10 unfinished intents per user. Inserts an
   `upload_intents` row, generates a **server-chosen quarantine key**
   `pending-uploads/<userId>/<uuid>.<ext>`, and returns a presigned `PUT` URL (**5 minutes**) whose
   signature is bound to the exact `Content-Type`.
2. **Upload** — the browser `PUT`s the file to `https://<ACCOUNT_ID>.r2.cloudflarestorage.com/...`
   (the S3 API endpoint; presigned URLs do not work on custom domains) with real progress
   (`XMLHttpRequest`). No R2 credential ever reaches the browser.
3. **Finalize** — `finalizeUploadFn({ intentId })`. Only the intent UUID is accepted (never a key,
   bucket or user id), looked up scoped to the session user. Then: `HeadObject` -> actual size
   (authoritative, checked **before** downloading) and stored Content-Type -> read the bytes ->
   the **same** `uploadAsset()` pipeline as the legacy route (magic bytes, MIME vs signature,
   decode, dimension/pixel limits, EXIF stripping for avatars) -> the **server** writes the validated
   bytes to a fresh final key the client never had a URL for -> `assets` row created -> the
   quarantine object is deleted -> `{ asset }` in the same shape as before (tools keep using `assetId`).

Design choices worth knowing:
- **Persistent intents (DB), not memory** — authorize and finalize can hit different serverless instances.
- **Quarantine key + server copy** — a presigned URL stays usable until it expires. If the final
  asset were the same object, a user could overwrite it with unvalidated bytes right after finalize.
  Because the server re-writes the validated bytes to a different key, that race does not exist.
- **Single finalization** — an atomic `finalize_claimed_at` claim means double-clicks/retries create
  one asset; a finished intent returns the existing asset. A crashed finalize can be re-claimed after 2 min.
- **Retry without re-upload** — the hook retries finalize (transient/in-progress errors) with backoff.
- **Rejections are permanent** — bad magic bytes, wrong/mismatched type, oversize, wrong declared
  size, corrupt image: the intent is invalidated and the object deleted (a failed delete is logged).
- **Intent lifetime** = 20 minutes (5 min upload + finalize grace); presigned URL = 5 minutes.
- Only these purposes can be requested by a browser: `AVATAR`, `IMAGE_TO_IMAGE_INPUT`,
  `BACKGROUND_REMOVAL_INPUT`, `UPSCALE_INPUT`, `OUTPAINT_INPUT`, `EDITOR_INPUT`. (Before 14A the
  legacy route accepted **any** purpose, including the system-only, publicly served `GENERATED_OUTPUT`.)
- In S3/R2 mode `POST /api/assets/upload` returns `DIRECT_UPLOAD_REQUIRED`. Local mode is unchanged.

Known limit: a presigned PUT cannot cap the byte count at R2, so a user could PUT more than they
declared. Finalize rejects and deletes it (and the per-user intent cap + rate limit + lifecycle rule
bound the cost), but the bytes do exist in the bucket briefly. Signing `content-length` is a possible
later hardening once real R2 behaviour has been tested.

## Required environment (no new variables)
`STORAGE_PROVIDER=s3`, `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `S3_REGION=auto`,
`S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`.
The API token behind the S3 credentials needs **Object Read & Write** on the bucket — a read-only
token fails as `AccessDenied` both on the browser PUT and on the server-side write at finalize.
- Local: `STORAGE_PROVIDER=local` (no R2 needed) — or `s3` + a dev bucket + localhost CORS below.
- Preview: `s3` with a **separate** bucket (or at least a separate token/prefix); CORS for the preview origin.
- Production: `s3` with the production bucket; CORS for the production domain only.

## R2 CORS (bucket -> Settings -> CORS policy)
Production:
```json
[
  {
    "AllowedOrigins": ["https://<PRODUCTION_DOMAIN>"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
Local development: same, with `"AllowedOrigins": ["http://localhost:5173"]`. Add a preview origin only
if previews really upload. Never use `"*"` in production. `GET`/`HEAD` are not needed: the browser
only ever PUTs; all reads happen server-side.

Symptoms when it is wrong:
- Browser console "blocked by CORS policy" and the hook says *"Couldn't reach file storage"* -> CORS missing/wrong origin.
- `403 SignatureDoesNotMatch` -> the request's `Content-Type` differs from the signed one (or the URL was altered/expired).
- `403 AccessDenied` -> the R2 token lacks write permission on this bucket.
- `403 ... expired`/`Request has expired` -> more than 5 minutes passed before the PUT started.

## Bucket lifecycle (orphan cleanup) — recommended, configure once
R2 -> bucket -> Settings -> Object lifecycle rules: **delete objects with prefix `pending-uploads/`
after 1 day**. That makes orphaned quarantine objects self-cleaning even if no job ever runs.
Additionally `cleanupExpiredUploadIntents()` (in `src/lib/storage/direct-upload.server.ts`) deletes
expired, unfinished intents and their objects and trims old completed rows. It is **not scheduled
yet**; wire it into the same cron that will reconcile stuck generations. Uploads do not depend on it.

## Private inputs / public outputs (bucket design) — still open
Inputs (`.../inputs/...`), quarantine (`pending-uploads/...`) and generated outputs / avatars share
one bucket, and outputs/avatars are served via `S3_PUBLIC_BASE_URL`. The bucket itself stays private
and presigned PUT does not require public access — but making the bucket public for outputs would
expose every key. Preferred: a **second, public bucket** for outputs/avatars (needs a small code change:
a separate public bucket setting) . Interim, no code: serve the public domain through a Cloudflare
custom domain with a WAF custom rule that blocks everything except
`^/users/[^/]+/(outputs|avatars|projects)/`. Do **not** enable the raw `r2.dev` URL on the bucket
that holds inputs. Avatars are public by design and are EXIF-stripped on every path.

## Manual test procedure (none of this has been run)
Prerequisites: R2 token with Object Read & Write, CORS applied, migration applied.
1. **8-10 MB image** (S3 mode): authorize and finalize requests are small JSON, the PUT goes to
   `*.r2.cloudflarestorage.com`, no 413, asset created, then run Expand/Editor with that asset id.
2. **Small image** (<1 MB): same result.
3. **Invalid bytes** (text/`.exe` renamed `.png`) signed as `image/png`: finalize rejects; no `assets` row; pending object gone.
4. **MIME spoof** (JPEG bytes, signed as `image/png`): finalize rejects (`MIME_MISMATCH`).
5. **Oversize**: >limit is refused at authorize; a spoofed declared size is rejected at finalize (`SIZE_MISMATCH`/`FILE_TOO_LARGE`).
6. **Cross-user**: user B calls finalize with user A's intent id -> "not found", no asset.
7. **Arbitrary key**: finalize with anything that is not an intent UUID -> "not found".
8. **Double finalize** (double-click or two calls): one `assets` row, same asset id both times.
9. **Expired intent**: set `expires_at` in the past -> `UPLOAD_EXPIRED`, no asset.
10. **Corrupt/truncated JPEG/PNG** -> rejected.
11. **Local regression** (`STORAGE_PROVIDER=local`): avatar, Background Removal, Upscale, Expand, Editor uploads work as before.
12. **History/My Creations** show generated outputs only, never uploaded inputs.

---

# Phase 14B — Stuck generations cleanup + automatic refunds

**Status: code written and parse-checked only. NOT typechecked, linted, built or runtime-tested** (the environment it was written in had no `node_modules`). Run the checks and manual tests below before relying on it.

## Problem
Every generation flow commits `generations` (QUEUED) + credit reservation, then does a separate `QUEUED -> PROCESSING` update, then the slow provider work. If the process dies after the reservation commit (Vercel timeout, crash, OOM, deploy), the catch/refund code never runs: the row stays QUEUED/PROCESSING and the credits stay deducted.

## Stale policy
- One global threshold: `GENERATION_STALE_MINUTES` (integer 5-240, default 15).
- `PROCESSING` and `started_at <= now - threshold` (`started_at` is set in the same UPDATE that sets PROCESSING; `created_at` is only a fallback if it were ever null).
- `QUEUED` and `created_at <= now - threshold` (QUEUED really is used: it exists between the credit transaction commit and the PROCESSING update, so it can be stranded too).
- All timestamps are `timestamptz` compared as `Date` objects (UTC).

## Design
- `src/lib/ai/lifecycle.server.ts` — guarded transitions used by all six flows (Text-to-Image, Image-to-Image, Background Removal, Upscale, Expand, Editor):
  - `QUEUED -> PROCESSING` only `WHERE status = 'QUEUED'`; if the cleanup already failed the row, the request throws `GENERATION_TIMEOUT` and never calls the provider.
  - `PROCESSING -> COMPLETED` only `WHERE status = 'PROCESSING'`. If cleanup won, the request's own `creations` rows (that `generation_id` only) are **soft-deleted** (`is_deleted = true`, no storage object touched) and `GENERATION_TIMEOUT` is thrown. A zero-row result first re-reads the status so a `withDbRetry` retry after a real commit is not mistaken for a lost race.
  - Normal failure: `QUEUED|PROCESSING -> FAILED` only (a COMPLETED row is never overwritten); refund skipped only if the row is COMPLETED.
- `src/lib/ai/cleanup.server.ts`:
  - `cleanupStaleGenerations()` — bounded batch (`CLEANUP_BATCH_SIZE = 50`, oldest first). For each candidate one conditional `UPDATE ... SET status='FAILED', error_code='GENERATION_TIMEOUT', completed_at=now WHERE id=? AND <stale predicate> RETURNING`. Zero rows = someone else changed it; skipped. Only a claimed row is refunded.
  - Refund amount = sum of the original `GENERATION` ledger rows for that generation (never the model's current price). No deduction row = nothing refunded.
  - Refund goes through the existing `refundCreditsIfNotAlready` (its unique partial index `credit_transactions_generation_refund_unique_idx` makes a second refund impossible). It now returns `true` only when it actually wrote the refund, so counts are accurate.
  - `reconcileTimedOutGenerationRefunds()` — retries refunds for rows that are `FAILED`, `error_code = 'GENERATION_TIMEOUT'`, have a `GENERATION` ledger row and no `REFUND` row. This is the recovery path if the refund fails after the claim (Option B: the existing refund service owns its own transaction, so claim + refund are not one transaction).
- `src/routes/api.cron.cleanup-generations.ts` — `GET` (Vercel Cron) and `POST` (manual). `503` if `CRON_SECRET` is unset, `401` unless `Authorization: Bearer <CRON_SECRET>` (constant-time compare; never read from the query string), `500` generic on failure. Response: `{ ok, scanned, claimed, skipped, refunded, refundFailed, reconciled }` — no ids, prompts, balances.
- No schema change, no migration, no new package, no new status.

## Environment
```
CRON_SECRET=<min 32 chars>          # required in production (boot fails without it)
GENERATION_STALE_MINUTES=15         # optional, 5-240
```
Generate a secret (PowerShell): `-join ((48..57)+(97..102) | Get-Random -Count 64 | ForEach-Object {[char]$_})`  (or `openssl rand -hex 32`).

## Vercel
`vercel.json` (new file — there was none) registers `*/10 * * * *` -> `/api/cron/cleanup-generations`. Crons run only on **production** deployments and are always `GET`. Set `CRON_SECRET` in Vercel (Production); Vercel sends it as `Authorization: Bearer`.
**Hobby plan only allows once-per-day crons — a `*/10` schedule is rejected at deploy.** On Hobby either change the schedule to a daily one (credits then stay stuck up to a day) or call the endpoint from an external scheduler with the Bearer header. After the first deploy confirm the job under Project -> Settings -> Cron Jobs (this project builds through the Nitro Vercel preset; registration from `vercel.json` has not been verified here).

## Local testing (PowerShell, dev server on :5173)
```powershell
$secret = "<CRON_SECRET from your .env>"
# authorized
Invoke-RestMethod -Uri "http://localhost:5173/api/cron/cleanup-generations" -Headers @{ Authorization = "Bearer $secret" }
# unauthorized (expect 401)
curl.exe -i http://localhost:5173/api/cron/cleanup-generations
curl.exe -i -H "Authorization: Bearer wrong" http://localhost:5173/api/cron/cleanup-generations
# secret in the query string must NOT work (expect 401)
curl.exe -i "http://localhost:5173/api/cron/cleanup-generations?secret=$secret"
# two near-simultaneous runs
1..2 | ForEach-Object { Start-Job { curl.exe -s -H "Authorization: Bearer $using:secret" http://localhost:5173/api/cron/cleanup-generations } } | Wait-Job | Receive-Job
```

## SQL (dev/test database only)
```sql
-- A. Create a stale PROCESSING generation with a 4-credit deduction (replace <USER_ID>)
BEGIN;
WITH g AS (
  INSERT INTO generations (user_id, type, status, credits_used, prompt, created_at, started_at)
  VALUES ('<USER_ID>', 'TEXT_TO_IMAGE', 'PROCESSING', 4, 'stale test',
          now() - interval '31 minutes', now() - interval '30 minutes')
  RETURNING id
), t AS (
  INSERT INTO credit_transactions (user_id, amount, type, description, generation_id)
  SELECT '<USER_ID>', -4, 'GENERATION', 'stale test deduction', id FROM g
  RETURNING generation_id
)
UPDATE credit_balances SET balance = balance - 4, updated_at = now() WHERE user_id = '<USER_ID>';
COMMIT;

-- B. Balance before / after
SELECT balance FROM credit_balances WHERE user_id = '<USER_ID>';

-- C. State + ledger for one generation
SELECT id, status, error_code, error_message, started_at, completed_at, credits_used
FROM generations WHERE id = '<GENERATION_ID>';
SELECT type, amount, created_at, description
FROM credit_transactions WHERE generation_id = '<GENERATION_ID>' ORDER BY created_at;

-- D. Anything still stranded
SELECT id, status, created_at, started_at FROM generations
WHERE status IN ('QUEUED','PROCESSING') ORDER BY created_at;

-- E. Timeout-failed rows with NO refund (should be empty after a cleanup run)
SELECT g.id, g.user_id, g.completed_at
FROM generations g
WHERE g.status = 'FAILED' AND g.error_code = 'GENERATION_TIMEOUT'
  AND EXISTS (SELECT 1 FROM credit_transactions t WHERE t.generation_id = g.id AND t.type = 'GENERATION')
  AND NOT EXISTS (SELECT 1 FROM credit_transactions t WHERE t.generation_id = g.id AND t.type = 'REFUND');

-- F. Exactly-once check: must return zero rows
SELECT generation_id, count(*) FROM credit_transactions
WHERE type = 'REFUND' AND generation_id IS NOT NULL GROUP BY generation_id HAVING count(*) > 1;

-- G. Simulate "claimed but refund failed" (then run the cron: expect reconciled = 1)
UPDATE generations SET status='FAILED', error_code='GENERATION_TIMEOUT',
  error_message='Generation timed out before completion.', completed_at=now()
WHERE id = '<GENERATION_ID>';
```

## Manual test checklist (none of it has been run)
1. Unauthorized: no header / wrong secret / query-string secret -> 401; `CRON_SECRET` unset in dev -> 503.
2. Stale: run SQL A, call cron -> `claimed 1, refunded 1`; generation FAILED + `GENERATION_TIMEOUT`, `completed_at` set, one REFUND row of +4, balance back to the pre-A value.
3. Run the cron again -> `claimed 0, refunded 0`; balance unchanged.
4. Fresh PROCESSING (`started_at = now()`), old COMPLETED row, and an already-refunded FAILED row are untouched (compare with query C).
5. Refund recovery: SQL G -> cron returns `reconciled: 1`, one REFUND row.
6. Concurrent runs (command above) -> total `refunded` across both = 1; query F empty.
7. History shows the row as Failed with "Generation timed out before completion."; no creation is created for it.
8. Phase 14A regression: R2 upload, finalize, Expand/Editor on an R2 asset; Text-to-Image success and a forced provider failure (single refund).

## Known gaps
- Not typechecked/linted/built/runtime-tested.
- The cleanup-vs-success race is closed by the conditional UPDATEs but has not been exercised under real concurrency.
- If a late-finishing request loses the race, its output **storage objects stay in the bucket** (only the `creations` rows are soft-deleted). Orphan reporting/cleanup is left for a later phase.
- Ordinary (non-timeout) failures still do FAILED-update then refund as two steps; a process kill exactly between them strands that refund. The reconciliation is deliberately scoped to `GENERATION_TIMEOUT`.
- Provider jobs are not cancelled.
