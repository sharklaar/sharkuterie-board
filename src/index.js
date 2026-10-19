import { formatIngredientQuantity } from "../public/js/ingredient-quantity.js";
import { manageOrganisation } from "./organisation.js";
import { authenticatedPerson, publicActivity } from "./identity.js";
import { dishFiles } from "../public/js/recipe-files.js";
import { getRecipeImagePath } from "../public/js/recipe-library.js";

function makeSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

function getImageType(bytes) {
  const isPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    .every((byte, index) => bytes[index] === byte);

  if (isPng) {
    return { extension: "png", contentType: "image/png" };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }

  const header = String.fromCharCode(...bytes);
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") {
    return { extension: "webp", contentType: "image/webp" };
  }

  if (
    header.slice(4, 8) === "ftyp" &&
    ["avif", "avis"].includes(header.slice(8, 12))
  ) {
    return { extension: "avif", contentType: "image/avif" };
  }

  return null;
}


const RECIPE_COLUMNS = `id, name, slug, description, yield,
  image_path, source_file, notes, created_at, updated_at`;

class RecipeError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function optionalText(value, field) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new RecipeError(`${field} must be text`);
  return value.trim() || null;
}

function optionalNumber(value, field) {
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RecipeError(`${field} must be a number of zero or more`);
  }
  return value;
}

function normaliseQuantity(row) {
  // Accept older clients with separate numeric quantities and units too.
  const quantity = typeof row.quantity === "number"
    ? String(optionalNumber(row.quantity, "Ingredient quantity"))
    : optionalText(row.quantity, "Ingredient quantity");
  const unit = optionalText(row.unit, "Ingredient unit");
  return formatIngredientQuantity(`${quantity || ""}${unit || ""}`);
}

function normaliseRows(rows, kind) {
  if (rows == null) return [];
  if (!Array.isArray(rows)) throw new RecipeError(`${kind} must be a list`);
  return rows.map(row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new RecipeError(`${kind} contain an invalid row`);
    }
    if (kind === "Ingredients") {
      return {
        name: optionalText(row.name, "Ingredient name"),
        quantity: normaliseQuantity(row),
        notes: optionalText(row.notes, "Ingredient notes"),
        section: optionalText(row.section, "Ingredient section")
      };
    }
    return {
      instruction: optionalText(row.instruction, "Instruction"),
      title: optionalText(row.title, "Step title"),
      why: optionalText(row.why, "Step explanation"),
      section: optionalText(row.section, "Method section")
    };
  }).filter(row => kind === "Ingredients" ? row.name : row.instruction);
}

async function saveRecipe(request, env, slug, actor) {
  let uploadedKey = null;
  let saved = false;
  try {
    let body;
    let imageFile = null;
    try {
      if (request.headers.get("content-type")?.includes("multipart/form-data")) {
        const contentLength = Number(request.headers.get("content-length") || 0);
        if (contentLength > MAX_IMAGE_SIZE + 512 * 1024) {
          throw new RecipeError("Photo must be 10 MB or smaller", 413);
        }
        const data = await request.formData();
        const recipeJson = data.get("recipe");
        if (typeof recipeJson !== "string") throw new RecipeError("Recipe details are required");
        body = JSON.parse(recipeJson);
        const file = data.get("image");
        if (file instanceof File && file.size > 0) imageFile = file;
      } else {
        body = await request.json();
      }
    } catch (error) {
      if (error instanceof RecipeError) throw error;
      throw new RecipeError("Recipe details could not be read");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new RecipeError("Recipe details are invalid");
    }
    const name = optionalText(body.name, "Recipe name");
    if (!name) throw new RecipeError("Recipe name is required");
    const ingredients = normaliseRows(body.ingredients, "Ingredients");
    const steps = normaliseRows(body.steps, "Steps");
    const description = optionalText(body.description, "Description");
    const recipeYield = optionalText(body.yield, "Yield");
    const notes = optionalText(body.notes, "Recipe notes");

    const existing = slug
      ? await env.DB.prepare(`SELECT ${RECIPE_COLUMNS} FROM recipes WHERE slug = ?`).bind(slug).first()
      : null;
    if (slug && !existing) throw new RecipeError("Recipe not found", 404);

    // Source identity belongs to the saved record and survives name changes.
    const sourceFile = existing ? existing.source_file : optionalText(body.source_file, "Recipe source");
    if (sourceFile && !dishFiles.includes(sourceFile)) throw new RecipeError("Recipe source is invalid");
    if (!existing && sourceFile) {
      const converted = await env.DB.prepare("SELECT id FROM recipes WHERE source_file = ?").bind(sourceFile).first();
      if (converted) throw new RecipeError("This recipe already has a saved version. Reload the editor to edit it.", 409);
    }
    const recipeSlug = existing?.slug || makeSlug(name) || crypto.randomUUID();
    let imagePath = existing?.image_path || (sourceFile ? getRecipeImagePath(body.image_path) : null);
    if (body.remove_image === true) imagePath = null;

    let imageType = null;
    if (imageFile) {
      if (imageFile.size > MAX_IMAGE_SIZE) throw new RecipeError("Photo must be 10 MB or smaller", 413);
      imageType = getImageType(new Uint8Array(await imageFile.slice(0, 12).arrayBuffer()));
      if (!imageType) throw new RecipeError("Use a JPEG, PNG, WebP, or AVIF photo", 415);
      uploadedKey = `recipe-images/${crypto.randomUUID()}.${imageType.extension}`;
      imagePath = `/media/${uploadedKey}`;
    }

    const statements = [];
    if (existing) {
      statements.push(env.DB.prepare(`
        UPDATE recipes SET name = ?, description = ?, yield = ?,
          image_path = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? RETURNING ${RECIPE_COLUMNS}
      `).bind(name, description, recipeYield, imagePath, notes, existing.id));
      statements.push(env.DB.prepare("DELETE FROM ingredients WHERE recipe_id = ?").bind(existing.id));
      statements.push(env.DB.prepare("DELETE FROM steps WHERE recipe_id = ?").bind(existing.id));
    } else {
      statements.push(env.DB.prepare(`
        INSERT INTO recipes (name, slug, description, yield, image_path, source_file, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING ${RECIPE_COLUMNS}
      `).bind(name, recipeSlug, description, recipeYield, imagePath, sourceFile, notes));
    }
    for (const [index, ingredient] of ingredients.entries()) {
      statements.push(env.DB.prepare(`
        INSERT INTO ingredients (recipe_id, quantity, unit, name, notes, sort_order, section)
        VALUES ((SELECT id FROM recipes WHERE slug = ?), ?, ?, ?, ?, ?, ?)
      `).bind(recipeSlug, ingredient.quantity, null, ingredient.name, ingredient.notes, index + 1, ingredient.section));
    }
    for (const [index, step] of steps.entries()) {
      statements.push(env.DB.prepare(`
        INSERT INTO steps (recipe_id, sort_order, title, instruction, why, section)
        VALUES ((SELECT id FROM recipes WHERE slug = ?), ?, ?, ?, ?, ?)
      `).bind(recipeSlug, index + 1, step.title, step.instruction, step.why, step.section));
    }

    statements.push(env.DB.prepare(`
      INSERT INTO recipe_activity (recipe_id, action, person_id, actor_email, actor_name, actor_position)
      VALUES ((SELECT id FROM recipes WHERE slug = ?), ?, ?, ?, ?, ?)
    `).bind(recipeSlug, existing ? "edited" : "created", actor.person?.id || null,
      actor.email, actor.person?.name || null, actor.person?.position || null));

    if (imageFile) {
      await env.IMAGES.put(uploadedKey, imageFile, { httpMetadata: {
        contentType: imageType.contentType,
        cacheControl: "public, max-age=31536000, immutable"
      } });
    }
    // D1 batches roll back the entire recipe if any ingredient or step fails.
    const results = await env.DB.batch(statements);
    saved = true;
    return Response.json(results[0].results[0], { status: existing ? 200 : 201 });
  } catch (error) {
    if (uploadedKey && !saved) {
      try { await env.IMAGES.delete(uploadedKey); } catch (cleanupError) { console.error(cleanupError); }
    }
    if (error instanceof RecipeError) return Response.json({ error: error.message }, { status: error.status });
    if (error.message?.includes("UNIQUE constraint failed")) {
      const message = error.message.includes("source_file")
        ? "This recipe already has a saved version. Reload the editor to edit it."
        : "A recipe with this name already exists. Please choose a different name.";
      return Response.json({ error: message }, { status: 409 });
    }
    console.error(error);
    return Response.json({ error: "Could not save recipe" }, { status: 500 });
  }
}

async function deleteRecipe(env, slug) {
  try {
    // Delete the whole recipe atomically, including databases created before migrations.
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM recipe_activity WHERE recipe_id = (SELECT id FROM recipes WHERE slug = ?)").bind(slug),
      env.DB.prepare("DELETE FROM ingredients WHERE recipe_id = (SELECT id FROM recipes WHERE slug = ?)").bind(slug),
      env.DB.prepare("DELETE FROM steps WHERE recipe_id = (SELECT id FROM recipes WHERE slug = ?)").bind(slug),
      env.DB.prepare("DELETE FROM recipes WHERE slug = ? RETURNING slug").bind(slug)
    ]);
    const recipe = results[3].results[0];
    if (!recipe) return Response.json({ error: "Recipe not found" }, { status: 404 });
    return Response.json({ deleted: true, slug: recipe.slug }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not delete recipe. Please try again." }, { status: 500 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const orgMatch = url.pathname.match(/^\/api\/organisation(?:\/([^/]+))?$/);
    if (orgMatch) return manageOrganisation(request, env, await authenticatedPerson(request, env), orgMatch[1] || null);
    if (url.pathname === "/api/session" && request.method === "GET") {
      const actor = await authenticatedPerson(request, env);
      return Response.json({ authenticated: Boolean(actor), name: actor?.person?.name || null, email: actor?.email || null,
        admin: actor?.person?.admin === true, development: actor?.development === true }, { status: actor ? 200 : 401,
        headers: { "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/auth/login" && request.method === "GET") {
      const requested = url.searchParams.get("returnTo") || "/";
      // Resolve against this origin and reject external destinations, including encoded slashes.
      const target = new URL(requested, url.origin);
      const returnTo = target.origin === url.origin && !target.pathname.startsWith("/auth/")
        ? target.pathname + target.search : "/";
      const actor = await authenticatedPerson(request, env);
      if (actor) return Response.redirect(url.origin + returnTo, 302);
      if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
        return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Local sign-in setup</title><body>
          <h1>Set up your local identity</h1><p>Cloudflare Access sign-in applies to the hosted site, not localhost.</p>
          <p>Set LOCAL_USER_EMAIL in your ignored .dev.vars file to an active user’s email from Manage Organisation, then stop and restart npm run dev.</p>
          <p>If you recently changed an email, restart the dev server: it may still be using the previous identity.</p>
          <a href="/">Try again</a></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      }
      const login = new URL(`/cdn-cgi/access/login/${url.hostname}`, env.ACCESS_ISSUER);
      login.searchParams.set("kid", env.ACCESS_AUD);
      login.searchParams.set("redirect_url", returnTo);
      return new Response(null, { status: 302, headers: { Location: login.href, "Cache-Control": "no-store" } });
    }
    if (url.pathname.startsWith("/media/recipe-images/") && request.method === "GET") {
      const key = url.pathname.slice("/media/".length);
      if (!/^recipe-images\/[a-f0-9-]+\.(?:jpg|png|webp|avif)$/i.test(key)) {
        return new Response("Image not found", { status: 404 });
      }
      const image = await env.IMAGES.get(key);
      if (!image) return new Response("Image not found", { status: 404 });
      const headers = new Headers();
      image.writeHttpMetadata(headers);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("X-Content-Type-Options", "nosniff");
      if (image.httpEtag) headers.set("ETag", image.httpEtag);
      return new Response(image.body, { headers });
    }

    if (url.pathname === "/api/ingredients" && request.method === "GET") {
      const query = url.searchParams.get("q")?.trim() || "";
      if (query.length < 2) return Response.json({ ingredients: [] });
      const escapedQuery = query.replace(/[!%_]/g, "!$&");
      const ingredients = await env.DB.prepare(`
        SELECT DISTINCT TRIM(name) AS name FROM ingredients
        WHERE TRIM(name) COLLATE NOCASE LIKE ? ESCAPE '!'
        ORDER BY name COLLATE NOCASE LIMIT 10
      `).bind(`${escapedQuery}%`).all();
      return Response.json({ ingredients: ingredients.results.map(ingredient => ingredient.name) });
    }

    if (url.pathname === "/api/recipes" && request.method === "GET") {
      const sourceFile = url.searchParams.get("source_file");
      const recipes = await env.DB.prepare(`
        SELECT ${RECIPE_COLUMNS},
          (SELECT GROUP_CONCAT(name, ' ') FROM ingredients WHERE recipe_id = recipes.id) AS ingredient_names
        FROM recipes ${sourceFile ? "WHERE source_file = ?" : ""} ORDER BY name
      `).bind(...(sourceFile ? [sourceFile] : [])).all();
      return Response.json({ recipes: recipes.results }, { headers: { "Cache-Control": "no-store" } });
    }

    const recipeMatch = url.pathname.match(/^\/api\/recipes\/([^/]+)$/);
    const slug = recipeMatch ? decodeURIComponent(recipeMatch[1]) : null;
    if (slug && request.method === "DELETE") {
      if (!await authenticatedPerson(request, env)) return Response.json({ error: "Please sign in through Cloudflare Access to change recipes." }, { status: 401 });
      return deleteRecipe(env, slug);
    }
    if (slug && request.method === "GET") {
      const recipe = await env.DB.prepare(`SELECT ${RECIPE_COLUMNS} FROM recipes WHERE slug = ?`).bind(slug).first();
      if (!recipe) return Response.json({ error: "Recipe not found" }, { status: 404 });
      const [ingredients, steps, activity] = await env.DB.batch([
        env.DB.prepare(`SELECT quantity, name, notes, sort_order, section
          FROM ingredients WHERE recipe_id = ? ORDER BY sort_order`).bind(recipe.id),
        env.DB.prepare(`SELECT sort_order, title, instruction, why, section
          FROM steps WHERE recipe_id = ? ORDER BY sort_order`).bind(recipe.id),
        env.DB.prepare("SELECT * FROM recipe_activity WHERE recipe_id = ? ORDER BY occurred_at, id").bind(recipe.id)
      ]);
      const people = (await env.DB.prepare("SELECT id, name, position, email FROM organisation_users").all()).results;
      return Response.json({ ...recipe, ingredients: ingredients.results.map(row => ({ ...row, quantity: formatIngredientQuantity(row.quantity) })), steps: steps.results, activity: activity.results.map(row => publicActivity(row, people)) }, {
        headers: { "Cache-Control": "no-store" }
      });
    }
    if ((url.pathname === "/api/recipes" && request.method === "POST") || (slug && request.method === "PUT")) {
      const actor = await authenticatedPerson(request, env);
      if (!actor) return Response.json({ error: "Please sign in through Cloudflare Access to save recipes." }, { status: 401 });
      return saveRecipe(request, env, slug, actor);
    }
    return env.ASSETS.fetch(request);
  }
};
