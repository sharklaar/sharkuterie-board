# Kitchen Ops

A small recipe library served by a Cloudflare Worker, with static pages in `public/` and recipe data in Cloudflare D1.

The recipe board and editor load recipes from D1 only. Legacy recipe files remain in `public/dishes/` for reference; `public/.assetsignore` excludes them from the served assets. They are not automatically imported into the database.

## Local development

Use Node.js 24 LTS. With `nvm`, select the project version with `nvm use`; then install the exact Wrangler version recorded in `package-lock.json`:

```sh
npm ci
npm run db:migrate:local
npm run dev
```

Wrangler serves the site at `http://localhost:8787`. The API is available at `http://localhost:8787/api/recipes`. Local D1 data is persisted under `.wrangler/` and is ignored by Git.

`npm run db:migrate:local` initializes a fresh local database and safely records the initial schema migration for an existing local database. Further schema changes belong in new, numbered files under `migrations/`.

## Cloudflare D1

The D1 binding in `wrangler.jsonc` points to the configured Cloudflare database. Remote D1 is separate from local D1. Before applying the initial migration remotely, inspect the remote schema and migration history and confirm that its existing tables match `migrations/0001_initial_schema.sql`. Back up the remote database first. Then, when ready, run:

```sh
npm run db:migrate:remote
```

This command is not part of local development and has not been run as part of setting up this project.

`kitchen-ops-dev.sql` is an earlier local database export containing sample data; it is retained as a reference and is not the migration source of truth.

## Recipe photos

Recipe photos are stored in the `kitchen-ops-recipe-images` R2 bucket. Local `wrangler dev` uses its local R2 simulation, stored under `.wrangler/`; local uploads do not reach Cloudflare.

Before deploying the photo upload feature, create the R2 bucket in the Cloudflare account used by this Worker:

```sh
npx wrangler r2 bucket create kitchen-ops-recipe-images
```

The Worker serves uploaded photos through `/media/recipe-images/...`; the bucket does not need public access. Uploads accept JPEG, PNG, WebP, or AVIF files up to 10 MB. `image_path` already exists in the D1 schema, so this feature does not need a database migration.

## Editing recipes

Open a recipe on the board and choose **Edit recipe**. The editor loads its ingredients, method, notes, groups, yield and existing photo. Saving a database recipe updates the same record; its URL stays the same when the name changes.

Choose **Delete recipe** on an open recipe to display a confirmation dialog. Confirming permanently deletes the database recipe, its ingredients and its method steps in one transaction; cancelling leaves it unchanged. No additional migration is needed. Archived recipe files remain in the repository.

Recipes previously saved from a file remain ordinary database recipes, with the original path recorded in `source_file`. Older edit links for those files load the saved database record. Files without a saved record are available only in the repository for reference.

Migration `0002_recipe_editing.sql` adds the source link, notes, tags and section fields. Apply migrations locally before running this version:

```sh
npm run db:migrate:local
```

Apply the same migration to remote D1 **before deploying this version**, using the backup and remote migration process above. Adding the columns preserves existing recipes and does not automatically import file recipes.

The editing integration checks use isolated local D1 and R2 storage via the Workers runtime bundled with Wrangler:

```sh
npm test
```

Migration `0003_recipe_yield.sql` adds the optional free-text yield field (for example, “12 rolls” or “1 litre”). Apply it locally and to remote D1 before deploying this version, following the migration process above.

Serves, search tags and structured recipe/step times are no longer used by the editor, board or API. Existing database columns are retained for compatibility; timing information can be written in descriptions or method instructions.

Migration `0004_ingredient_quantity_text.sql` converts ingredient quantities to text and merges existing quantities and units (for example, `200` + `g` → `200g`). It preserves ingredient IDs, ordering, names, notes and groups. Apply it before deploying the single quantity field. The API accepts older clients with separate quantity and unit values.

## Organisation and recipe attribution

Organisation users now live in D1. Admins use the top-left menu → Manage Organisation to add, edit and remove users or assign admin access. Migration `0006_organisation.sql` seeds the seven original users, retaining their IDs. Emails remain optional for team members; admins require an email. Only authenticated admins can access the organisation API. The last admin cannot be removed or demoted. Removing a user hides them from the active list and revokes their organisation admin role while retaining recipe attribution. Cloudflare Access sign-in policies remain separate.

Writes verify the signature, issuer, audience and expiry of the Cloudflare Access JWT. `ACCESS_ISSUER` and `ACCESS_AUD` in `wrangler.jsonc` identify this site's Access application. Local writes also need a valid token; integration tests use their own signing key and mock Access certificates. Missing or invalid identity cannot save or delete recipes. Verified identity alone does not grant access: every recipe, photo and organisation request requires an active membership in the selected organisation.

Apply `0005_recipe_activity.sql` before deploying. Each successful creation/edit adds an atomic history event, shown at the top of the expanded recipe with UK dates. Existing recipes receive an Unknown creator event at their original creation date; historical editors cannot be reconstructed. Adding attribution to old recipes requires an explicit mapping. History API responses contain names and positions, never emails. Names/positions resolve from the current directory, with saved snapshots as a fallback.

## Sessions and localhost

The board and editor check `/api/session` on load and before saves/deletions. Missing or expired hosted sessions navigate through `/auth/login` to Cloudflare Access and return to the requested page. Connection failures show an error instead of redirecting. Login destinations are restricted to this origin.

Localhost does not receive the hosted site's Cloudflare Access credentials. For local development, set `LOCAL_USER_EMAIL="your-listed-email"` in ignored `.dev.vars` and restart `npm run dev`. This explicitly simulates that person's identity for local data only. The setting is accepted only on localhost/loopback URLs and only for an email in the organisation database; never add it to deployed variables. If unset, the local login route explains setup instead of looping through a hosted login. This does not create a production session.

Apply migration `0006_organisation.sql` before deploying the organisation management page. User changes take effect on the next request; no redeployment is needed. Recipe history resolves stable person IDs against the database, including removed users, with saved name/position snapshots as a fallback.


## Organisations and permissions

Migration `0008_organisations.sql` moves all existing users, recipes, ingredients, methods and activity into **William Cecil**, preserving IDs, URLs, timestamps and attribution. Existing admins keep full admin/editor permissions; all other existing staff become Members. It also creates **Daffern Family**, with Marc Daffern (Chef/Admin), Toby Daffern and William Daffern (Mush/Member), using their supplied email addresses. Positions and permissions belong to each membership; one verified email can have memberships in multiple organisations.

Members can view and create recipes. Editors can also edit any saved recipe, including their own. Admins can do everything, including deleting recipes and managing their organisation's memberships and permissions. The last active admin cannot be removed or demoted, even if the same person is an admin elsewhere. Removing one membership leaves the person's other memberships and recipe history intact.

The shared header shows the active organisation on the left and signed-in user on the right. Only people with multiple memberships see an organisation selector. Switching returns to a clean recipe board; unsaved recipe changes require confirmation. The active organisation is stored per tab in sessionStorage, and requests carry `X-Organisation-Id`. The server verifies that selection against the authenticated email's active memberships on every request. Revoked selections fail rather than silently saving into another organisation.

Recipe lists, reads, writes, ingredient suggestions, source-file lookups and uploaded photos are scoped to the selected organisation. Photo URLs include an organisation selector, validated against membership; image responses are private and not cached. Legacy static photos are restricted to William Cecil members, and archived recipe pages remain excluded from assets. `assets.run_worker_first` must remain enabled so static image access cannot bypass the Worker.

Before production deployment, export a remote D1 backup and rehearse the migration against a copy of production data. Apply the remote migration during a maintenance window and deploy the matching Worker immediately afterward: older clients/code do not enforce the new permissions. Verify both organisations, existing recipe counts/history and photo access. Local migrations do **not** change production. Cloudflare Access must separately allow each person's email to sign in; adding a membership does not change Access policies or send an invitation email.

Migration `0009_organisation_types_and_test_member.sql` identifies William Cecil as `professional` and Daffern Family as `lite`, and adds Marc (`marcdaffern@hotmail.com`, position Chef) as a Member of Daffern Family only. The main Marc account keeps both Admin memberships. Organisation type is returned in session data; section, shift checklist and prep list workflows remain on the snag list and are intended for Professional organisations. This migration does not change Cloudflare Access policies.


## Recipe sections

Migration `0010_recipe_sections.sql` adds optional recipe sections for Professional organisations. William Cecil starts with Larder, Sauce, Pastry and Shared, and all recipes belonging to William Cecil at migration time are assigned to Larder without changing their IDs, contents, timestamps or history. Other organisations' recipes remain unchanged. New recipes default to Unassigned.

Admins add, rename and remove sections under Manage Organisation. Members can select a section while creating recipes; changing a saved recipe's section follows the existing Editor/Admin permission rule. Renaming a section updates its displayed name across recipes. Removing it atomically clears recipe assignments and preserves recipes. Section names are unique within their organisation, ignoring case. The API rejects foreign organisation sections and all section operations for Lite organisations. Ingredient and method group headings remain independent of recipe sections.

Staff are not assigned to sections. Shared behaves like an ordinary section. Prep lists and their access rules are deferred. Apply the migration before deploying this code; it is additive and the previous Worker remains compatible with the migrated schema.
