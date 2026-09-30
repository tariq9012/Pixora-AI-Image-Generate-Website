# Drizzle migrations

This folder holds generated SQL migration files (`npm run db:generate`) and
Drizzle's own `meta/` snapshot directory used to compute future diffs.

No migrations have been generated yet — run `npm run db:generate` after
setting `DATABASE_URL` in `.env` to create the first one, covering every
table in `src/db/schema/`.

Commit these files to git once generated; they are the reviewable history
of every schema change and are required (alongside `meta/_journal.json`)
for `npm run db:migrate` to know what has already been applied.
