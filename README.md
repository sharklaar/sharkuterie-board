# Sharkuterie Board

A small recipe library served by a Cloudflare Worker, with static pages in `public/` and recipe data in Cloudflare D1.

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
