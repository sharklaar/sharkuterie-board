# Private recipes release — 29 October 2026

Production: https://kitchen-ops.marcs-apps.workers.dev

- Application commit: `e6de441`.
- Migration: `0011_private_recipes.sql`, applied before deployment; no pending migrations remain.
- Released Worker: `6ecc9537-ae68-4bde-afc3-471b9f7724f6`, verified active at 100%.

The private recipe toggle and simplified method editor are deployed. All 40 tests and the release build passed. The user verified private visibility locally using the primary and Hotmail accounts. Signed-in production verification remains outstanding.

A production backup was taken and the migration rehearsed against it. Comparing the post-migration production export with the backup confirmed all original fields and records were preserved, including all 24 recipes. Existing recipes remain shared; all 24 have recorded creators. Foreign keys are valid. The deployed Worker has no LOCAL_USER_EMAIL binding. Five unauthenticated routes returned login redirects.

Private backups, deployment metadata, rehearsal and verification records are retained in ignored `.wrangler/releases/2026-10-29-private-recipes/`.

Once private recipes exist, do not roll back to code without privacy enforcement. Preserve subsequent writes when considering database recovery. Production Access policies were not changed.
