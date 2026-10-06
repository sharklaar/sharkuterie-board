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

Open a recipe on the board and choose **Edit recipe**. The editor loads its ingredients, method, notes, groups, search tags and existing photo. Saving a database recipe updates the same record; its URL stays the same when the name changes.

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
