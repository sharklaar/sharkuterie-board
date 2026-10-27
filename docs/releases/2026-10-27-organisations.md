# Organisation foundation release — 27 October 2026

Production: https://kitchen-ops.marcs-apps.workers.dev

- Application commit: `44518d0` (organisation foundation).
- Previous Worker version: `0c42935b-15d5-40a8-9587-561c7c197205`.
- Temporary maintenance version: `33e10a4d-88f4-43d2-9f74-d48468baa1c7`.
- Released Worker version: `691fa154-df9b-48ec-82aa-22f4fd64a5e5`.
- Applied production migrations: `0008_organisations.sql` and `0009_organisation_types_and_test_member.sql`.

## Validation

All 31 tests passed, and Wrangler's release build passed. A production export was migrated locally and verified before maintenance. A second export was taken with the production Worker serving maintenance responses, and the rehearsal was repeated against that final backup.

After applying the production migrations, a fresh production export was compared field-for-field with the final backup. All 23 recipes, 112 ingredients, 69 method steps, 29 activity entries and seven original staff records were preserved. All existing recipes belong to William Cecil. Daffern Family has one Admin and three Members. Remote foreign key checks passed; no production migrations remain pending.

Cloudflare confirms the released version and expected D1, R2 and assets bindings, with no LOCAL_USER_EMAIL production binding. Unauthenticated requests to the board, session API and recipe API redirect to Cloudflare Access. Access policies were not changed. Signed-in end-to-end checks with Marc's main account and Hotmail Member account still require the user's email login codes; their Cloudflare sign-in eligibility was not independently verified.

## Recovery material

Private exports, pre-release D1 recovery metadata, deployment metadata, rehearsal results and production comparison results are stored locally in ignored `.wrangler/releases/2026-10-27/`. The final pre-migration export is `production-maintenance.sql`. These files are intentionally not committed to Git.

Do not roll back only the Worker: the previous version is not organisation-aware. If recovery is needed, first use maintenance mode and assess any writes since this release. Restoring a pre-migration database would discard later writes, so preserve and reconcile them before restoring. Only restore the old Worker alongside its matching database state. Prefer fixing forward while keeping the new organisation boundaries enforced.

## Remaining work

The pending Lite/Professional feature boundaries, sections, prep lists, shift checklists, branding and mobile spelling work are tracked in `docs/snag-list.md`. They are not included in this release.
