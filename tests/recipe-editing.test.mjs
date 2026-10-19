import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

let runtime;
let db;
let images;

before(async () => {
  // Use the local Workers runtime shipped with the project's pinned Wrangler.
  runtime = new Miniflare(convertV4MiniflareOptions({
    modules: ["src/index.js", "public/js/recipe-files.js", "public/js/recipe-library.js"]
      .map(path => ({ type: "ESModule", path })),
    compatibilityDate: "2026-09-22",
    d1Databases: ["DB"],
    r2Buckets: ["IMAGES"]
  }));
  db = await runtime.getD1Database("DB");
  images = await runtime.getR2Bucket("IMAGES");
  for (const path of ["migrations/0001_initial_schema.sql", "migrations/0002_recipe_editing.sql", "migrations/0003_recipe_yield.sql", "migrations/0004_ingredient_quantity_text.sql"]) {
    if (path.endsWith("0004_ingredient_quantity_text.sql")) {
      await db.prepare("INSERT INTO recipes (id, name, slug) VALUES (9000, 'Migration recipe', 'migration-recipe')").run();
      for (const [index, quantity, unit] of [[0, 200, "g"], [1, 0.5, "tsp"], [2, null, "to taste"], [3, 0, null], [4, null, null]]) {
        await db.prepare("INSERT INTO ingredients (id, recipe_id, quantity, unit, name, notes, sort_order, section) VALUES (?, 9000, ?, ?, 'Salt', 'fine', ?, 'Sauce')")
          .bind(9000 + index, quantity, unit, index).run();
      }
    }
    const sql = await readFile(path, "utf8");
    for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
});

after(async () => { await runtime?.dispose(); });

async function request(path, method = "GET", recipe, photo) {
  let body;
  let headers;
  if (photo) {
    body = new FormData();
    body.append("recipe", JSON.stringify(recipe));
    body.append("image", new Blob([photo], { type: "image/png" }), "recipe.png");
    const encoded = new Request("http://localhost", { method, body });
    headers = { "Content-Type": encoded.headers.get("Content-Type") };
    body = new Uint8Array(await encoded.arrayBuffer());
  } else if (recipe !== undefined) {
    body = JSON.stringify(recipe);
    headers = { "Content-Type": "application/json" };
  }
  const response = await runtime.dispatchFetch(`http://localhost${path}`, { method, body, headers });
  return { status: response.status, body: await response.json() };
}

const original = name => ({
  name,
  description: "A kitchen recipe",
  serves: "4–6",
  total_time_minutes: 30,
  tags: "starter prep",
  notes: "Keep chilled.\nPlate to order.",
  ingredients: [{ name: "Butter", quantity: 100, unit: "g", notes: "cold", section: "Sauce" }],
  steps: [{ title: "Make the sauce", instruction: "Melt the butter.", section: "Prep", why: "Keep it gentle.", time_offset_minutes: 5 }]
});

test("existing recipes keep their identity and replace their ingredient and method rows", async () => {
  const recipe = original("Editing integration recipe");
  const created = await request("/api/recipes", "POST", recipe);
  assert.equal(created.status, 201);
  const edited = await request(`/api/recipes/${created.body.slug}`, "PUT", {
    ...recipe, name: "Renamed integration recipe", serves: "8", notes: "Updated notes",
    ingredients: [{ name: "Milk", quantity: 250, unit: "ml", section: "Custard" }],
    steps: [{ instruction: "Warm the milk.", section: "Cook" }]
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.id, created.body.id);
  assert.equal(edited.body.slug, created.body.slug);
  const loaded = await request(`/api/recipes/${created.body.slug}`);
  assert.equal(loaded.body.name, "Renamed integration recipe");
  assert.equal("serves" in loaded.body, false);
  assert.equal("total_time_minutes" in loaded.body, false);
  assert.equal("tags" in loaded.body, false);
  assert.equal("time_offset_minutes" in loaded.body.steps[0], false);
  assert.equal(loaded.body.notes, "Updated notes");
  assert.equal(loaded.body.ingredients.length, 1);
  assert.equal(loaded.body.ingredients[0].name, "Milk");
  assert.equal(loaded.body.ingredients[0].section, "Custard");
  assert.equal(loaded.body.steps.length, 1);
  assert.equal(loaded.body.steps[0].instruction, "Warm the milk.");
  assert.equal(loaded.body.steps[0].section, "Cook");
  assert.equal("heat_level" in loaded.body, false);
});

test("a file conversion stays linked after renaming and cannot be imported twice", async () => {
  const recipe = { ...original("Converted salmon"), source_file: "dishes/salmon-ceviche.html", image_path: "/images/salmon-ceviche.jpg" };
  const created = await request("/api/recipes", "POST", recipe);
  assert.equal(created.status, 201);
  assert.equal(created.body.image_path, recipe.image_path);
  const updated = await request(`/api/recipes/${created.body.slug}`, "PUT", {
    ...recipe, name: "Salmon renamed again", source_file: null
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.source_file, recipe.source_file);
  assert.equal(updated.body.id, created.body.id);
  const filtered = await request(`/api/recipes?source_file=${encodeURIComponent(recipe.source_file)}`);
  assert.equal(filtered.body.recipes.length, 1);
  assert.equal(filtered.body.recipes[0].name, "Salmon renamed again");
  assert.match(filtered.body.recipes[0].ingredient_names, /Butter/);
  assert.equal("tags" in filtered.body.recipes[0], false);
  const duplicate = await request("/api/recipes", "POST", { ...recipe, name: "Another salmon" });
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.body.error, /saved version/);
  await assert.rejects(db.prepare("INSERT INTO recipes (name, slug, source_file) VALUES (?, ?, ?)")
    .bind("Duplicate", "duplicate-source", recipe.source_file).run(), /UNIQUE/);
});

test("a failed edit rolls back changes to the recipe, ingredients and steps", async () => {
  const recipe = original("Atomic editing recipe");
  const created = await request("/api/recipes", "POST", recipe);
  await db.prepare(`CREATE TRIGGER reject_test_step BEFORE INSERT ON steps
    WHEN NEW.instruction = 'REJECT TEST STEP' BEGIN SELECT RAISE(ABORT, 'Rejected test instruction'); END`).run();
  try {
    const edited = await request(`/api/recipes/${created.body.slug}`, "PUT", {
      ...recipe, name: "This should roll back", ingredients: [{ name: "Salt" }],
      steps: [{ instruction: "REJECT TEST STEP" }]
    });
    assert.equal(edited.status, 500);
    const loaded = await request(`/api/recipes/${created.body.slug}`);
    assert.equal(loaded.body.name, recipe.name);
    assert.equal(loaded.body.ingredients[0].name, "Butter");
    assert.equal(loaded.body.steps[0].instruction, "Melt the butter.");
  } finally { await db.prepare("DROP TRIGGER reject_test_step").run(); }
});

test("photos are retained, replaced and removed explicitly during edits", async () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const recipe = original("Photo editing recipe");
  const created = await request("/api/recipes", "POST", recipe, png);
  assert.equal(created.status, 201);
  const key = created.body.image_path.slice("/media/".length);
  assert.ok(await images.get(key));
  const preserved = await request(`/api/recipes/${created.body.slug}`, "PUT", recipe);
  assert.equal(preserved.body.image_path, created.body.image_path);
  const replaced = await request(`/api/recipes/${created.body.slug}`, "PUT", recipe, png);
  assert.equal(replaced.status, 200);
  assert.notEqual(replaced.body.image_path, created.body.image_path);
  const removed = await request(`/api/recipes/${created.body.slug}`, "PUT", { ...recipe, remove_image: true });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.image_path, null);
});

test("a failed create leaves no partial recipe or orphaned new photo", async () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const before = await images.list();
  await db.prepare(`CREATE TRIGGER reject_create_test BEFORE INSERT ON ingredients
    WHEN NEW.name = 'REJECT TEST INGREDIENT' BEGIN SELECT RAISE(ABORT, 'Rejected test ingredient'); END`).run();
  try {
    const created = await request("/api/recipes", "POST", {
      ...original("Failed photo recipe"), ingredients: [{ name: "REJECT TEST INGREDIENT" }]
    }, png);
    assert.equal(created.status, 500);
    assert.equal((await request("/api/recipes/failed-photo-recipe")).status, 404);
    assert.equal((await images.list()).objects.length, before.objects.length);
  } finally { await db.prepare("DROP TRIGGER reject_create_test").run(); }
});

test("missing recipes, invalid sources and invalid data give actionable errors", async () => {
  assert.equal((await request("/api/recipes/missing", "PUT", original("Missing"))).status, 404);
  assert.equal((await request("/api/recipes", "POST", { ...original("Invalid source"), source_file: "../secret.html" })).status, 400);
  assert.equal((await request("/api/recipes", "POST", { ...original("Invalid amount"), ingredients: [{ name: "Salt", quantity: -5 }] })).status, 400);
  assert.equal((await request("/api/recipes", "POST", { name: "   " })).status, 400);
});


test("optional yield is saved, edited and cleared", async () => {
  const recipe = original("Yield recipe");
  const created = await request("/api/recipes", "POST", { ...recipe, yield: "  12 rolls  " });
  assert.equal(created.status, 201);
  assert.equal((await request(`/api/recipes/${created.body.slug}`)).body.yield, "12 rolls");
  const edited = await request(`/api/recipes/${created.body.slug}`, "PUT", { ...recipe, yield: "24 rolls" });
  assert.equal(edited.body.yield, "24 rolls");
  const cleared = await request(`/api/recipes/${created.body.slug}`, "PUT", { ...recipe, yield: " " });
  assert.equal(cleared.body.yield, null);
  const omitted = await request("/api/recipes", "POST", original("No yield recipe"));
  assert.equal(omitted.status, 201);
  assert.equal(omitted.body.yield, null);
});


test("text quantities survive creating and editing, including legacy client amounts", async () => {
  const recipe = original("Text quantity recipe");
  recipe.ingredients = ["200g", "1/2 tsp", "2–3", "to taste", null].map((quantity, i) => ({ name: `Item ${i}`, quantity }));
  const created = await request("/api/recipes", "POST", recipe);
  assert.equal(created.status, 201);
  const loaded = await request(`/api/recipes/${created.body.slug}`);
  assert.deepEqual(loaded.body.ingredients.map(row => row.quantity), ["200g", "1/2 tsp", "2–3", "to taste", null]);
  const edited = await request(`/api/recipes/${created.body.slug}`, "PUT", { ...recipe, ingredients: [{ name: "Butter", quantity: 200, unit: "g" }] });
  assert.equal(edited.status, 200);
  const saved = await request(`/api/recipes/${created.body.slug}`);
  assert.equal(saved.body.ingredients[0].quantity, "200g");
  assert.equal("unit" in saved.body.ingredients[0], false);
});


test("migration preserves existing ingredient data and combines quantities and units", async () => {
  const rows = (await db.prepare("SELECT * FROM ingredients WHERE recipe_id = 9000 ORDER BY sort_order").all()).results;
  assert.deepEqual(rows.map(row => row.quantity), ["200g", "0.5tsp", "to taste", "0", null]);
  rows.forEach((row, index) => {
    assert.equal(row.id, 9000 + index);
    assert.equal(row.name, "Salt");
    assert.equal(row.notes, "fine");
    assert.equal(row.section, "Sauce");
    assert.equal(row.sort_order, index);
    assert.equal(row.unit, null);
  });
});
