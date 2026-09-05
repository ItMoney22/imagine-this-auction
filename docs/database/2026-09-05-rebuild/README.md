# ITA database rebuild — 5 September 2026

Target: `lyijpsppmbgjcvzaxhzn`. David explicitly authorized rebuilding this project after the launch builder reached its limit. The target initially had no public tables and no auth users. No source records were deleted or transferred.

Applied through the authenticated Supabase SQL Editor:

1. `01-core.sql`: frozen snapshot of 21 canonical ITA migrations. `applied-core-manifest.json` records the exact hashes. Dated legacy bid migrations were excluded because they regress newer functions.
2. `03-community.sql`: 029 access hardening, 030 community schema, 031 transactions. `02-access.sql` is a reference copy of 029, already included in 03; do not run it separately.
3. `04-storage.sql`: 033 catalog storage policies and AR bucket.
4. `05-community-completion.sql`: 034 profile images and 035 auction announcements.

These are already applied; they are not pending instructions for David. The private `ita_internal.migrations` ledger records application. Community remains disabled through `feature_flags.community_v1`. No deployment or production feature activation was performed.

Final checks after 035: zero public tables without RLS; six storage buckets. Launch work continued independently and added tables during this rebuild, so table count is not a fixed acceptance criterion. Do not overwrite newer launch migrations. `candidate-manifest.json` is a later source snapshot, not the applied manifest; 019b changed after the frozen rebuild. The builder preserves the applied core and writes candidate output when a frozen manifest exists.

Validation: the frozen core and community bundles replay successfully in PGlite with mocked Supabase schemas/roles. Twelve workflow/security cases cover publication, notifications, ownership, blocked-user visibility, moderation, scheduling, rate limiting, catalog storage, identity photos, and announcement idempotency. Live temporary-account checks passed sign-in, own-profile access, and denied role escalation. Temporary QA accounts were removed after testing.

No historical users, auction records, storage objects, external payment configuration, or third-party secrets were imported. New launch migrations remain owned by the launch build.
