import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

let runtime;
let db;
let images;
let privateKey;
let publicJwk;
async function accessToken(email = "marc@blackhawkdown.org.uk", overrides = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "RS256", kid: "test-key" })}.${encode({ iss: "https://test-access.example", aud: ["test-aud"], exp: Math.floor(Date.now() / 1000) + 600, email, ...overrides })}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(body));
  return `${body}.${Buffer.from(signature).toString("base64url")}`;
}

before(async () => {
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  privateKey = keys.privateKey;
  publicJwk = { ...await crypto.subtle.exportKey("jwk", keys.publicKey), kid: "test-key" };
  // Use the local Workers runtime shipped with the project's pinned Wrangler.
  runtime = new Miniflare(convertV4MiniflareOptions({
    modules: ["src/index.js", "src/identity.js", "src/organisation.js", "public/js/recipe-files.js", "public/js/recipe-library.js", "public/js/ingredient-quantity.js"]
      .map(path => ({ type: "ESModule", path })),
    bindings: { ACCESS_ISSUER: "https://test-access.example", ACCESS_AUD: "test-aud" },
    outboundService: async () => Response.json({ keys: [publicJwk] }),
    serviceBindings: { ASSETS: async () => new Response("Static asset") },
    compatibilityDate: "2026-09-22",
    d1Databases: ["DB"],
    r2Buckets: ["IMAGES"]
  }));
  db = await runtime.getD1Database("DB");
  images = await runtime.getR2Bucket("IMAGES");
  for (const path of ["migrations/0001_initial_schema.sql", "migrations/0002_recipe_editing.sql", "migrations/0003_recipe_yield.sql", "migrations/0004_ingredient_quantity_text.sql", "migrations/0005_recipe_activity.sql", "migrations/0006_organisation.sql", "migrations/0007_correct_marc_email.sql", "migrations/0008_organisations.sql", "migrations/0009_organisation_types_and_test_member.sql", "migrations/0010_recipe_sections.sql", "migrations/0011_private_recipes.sql"]) {
    if (path.endsWith("0004_ingredient_quantity_text.sql")) {
      await db.prepare("INSERT INTO recipes (id, name, slug) VALUES (9000, 'Migration recipe', 'migration-recipe')").run();
      for (const [index, quantity, unit] of [[0, 200, "g"], [1, 0.5, "tsp"], [2, null, "to taste"], [3, 0, null], [4, null, null]]) {
        await db.prepare("INSERT INTO ingredients (id, recipe_id, quantity, unit, name, notes, sort_order, section) VALUES (?, 9000, ?, ?, 'Salt', 'fine', ?, 'Sauce')")
          .bind(9000 + index, quantity, unit, index).run();
      }
    }
    if (path.endsWith("0010_recipe_sections.sql")) {
      await db.prepare("INSERT INTO recipes (id, name, slug, organisation_id) VALUES (9100, 'Existing family migration fixture', 'family-migration-fixture', 'daffern-family')").run();
    }
    const sql = await readFile(path, "utf8");
    for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
    if (path.endsWith("0010_recipe_sections.sql")) {
      const family = await db.prepare("SELECT section_id FROM recipes WHERE id = 9100").first();
      assert.equal(family.section_id, null, "existing family recipes must stay unassigned");
      await db.prepare("DELETE FROM recipes WHERE id = 9100").run();
    }
  }
});

after(async () => { await runtime?.dispose(); });

async function request(path, method = "GET", recipe, photo, email, organisation) {
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
  headers = { ...headers, "Cf-Access-Jwt-Assertion": await accessToken(email), ...(organisation ? { "X-Organisation-Id": organisation } : {}) };
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


test("creator and every editor are recorded from verified identity, ignoring submitted attribution", async () => {
  const recipe = { ...original("Attribution recipe"), actor_email: "liam@woodford.group", activity: [{ name: "Spoofed" }] };
  const created = await request("/api/recipes", "POST", recipe, null, "alex_biggs@hotmail.com");
  assert.equal(created.status, 201);
  await request(`/api/recipes/${created.body.slug}`, "PUT", recipe, null, "liam@woodford.group");
  await request(`/api/recipes/${created.body.slug}`, "PUT", recipe, null, "marc@blackhawkdown.org.uk");
  const loaded = await request(`/api/recipes/${created.body.slug}`);
  assert.deepEqual(loaded.body.activity.map(row => [row.action, row.name]), [["created", "Alex Biggs"], ["edited", "Liam Goodwill"], ["edited", "Marc Daffern"]]);
  assert.equal(loaded.body.activity[0].position, "Sous Chef");
  assert.equal(JSON.stringify(loaded.body.activity).includes("@"), false);
  const deleted = await request(`/api/recipes/${created.body.slug}`, "DELETE");
  assert.equal(deleted.status, 200);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM recipe_activity WHERE recipe_id = ?").bind(created.body.id).first()).count, 0);
});

test("missing, tampered, expired and wrong-audience tokens cannot write or spoof email", async () => {
  const valid = await accessToken();
  for (const token of [null, valid.slice(0, -8) + "tampered", await accessToken(undefined, { exp: 1 }), await accessToken(undefined, { aud: ["other"] }), await accessToken(undefined, { iss: "https://other.example" })]) {
    const response = await runtime.dispatchFetch("http://localhost/api/recipes", {
      method: "POST", headers: { "Content-Type": "application/json", "Cf-Access-Authenticated-User-Email": "liam@woodford.group", ...(token ? { "Cf-Access-Jwt-Assertion": token } : {}) }, body: JSON.stringify(original("Unauthenticated recipe"))
    });
    assert.equal(response.status, 401);
  }
});

test("legacy recipes have unknown creators and failed saves leave no history", async () => {
  const legacy = await request("/api/recipes/migration-recipe");
  assert.equal(legacy.body.activity[0].name, "Unknown");
  assert.equal(legacy.body.activity[0].occurred_at, legacy.body.created_at);
  const recipe = original("Activity rollback recipe");
  const created = await request("/api/recipes", "POST", recipe);
  await db.prepare(`CREATE TRIGGER reject_history BEFORE INSERT ON recipe_activity WHEN NEW.action = 'edited' BEGIN SELECT RAISE(ABORT, 'History failure'); END`).run();
  try {
    const edited = await request(`/api/recipes/${created.body.slug}`, "PUT", { ...recipe, name: "Should not save" });
    assert.equal(edited.status, 500);
    const loaded = await request(`/api/recipes/${created.body.slug}`);
    assert.equal(loaded.body.name, recipe.name);
    assert.equal(loaded.body.activity.length, 1);
  } finally { await db.prepare("DROP TRIGGER reject_history").run(); }
});

test("session checks identify the current user and reject expired sessions", async () => {
  const session = await request("/api/session");
  assert.equal(session.status, 200);
  assert.equal(session.body.authenticated, true);
  assert.equal(session.body.name, "Marc Daffern");
  assert.equal(session.body.email, "marc@blackhawkdown.org.uk");
  for (const token of [null, await accessToken(undefined, { exp: 1 })]) {
    const response = await runtime.dispatchFetch("https://kitchen-ops.marcs-apps.workers.dev/api/session", {
      headers: token ? { "Cf-Access-Jwt-Assertion": token } : {}
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal((await response.json()).authenticated, false);
  }
});

test("hosted login sends unauthenticated users to Access with a safe return path", async () => {
  const origin = "https://kitchen-ops.marcs-apps.workers.dev";
  const response = await runtime.dispatchFetch(`${origin}/auth/login?returnTo=${encodeURIComponent('/add-recipe.html?recipe=test')}`, { redirect: "manual" });
  assert.equal(response.status, 302);
  const destination = new URL(response.headers.get("Location"));
  assert.equal(destination.origin, "https://test-access.example");
  assert.equal(destination.searchParams.get("kid"), "test-aud");
  assert.equal(destination.searchParams.get("redirect_url"), "/add-recipe.html?recipe=test");
  for (const path of ["https://evil.example", "//evil.example", "/auth/login"]) {
    const unsafe = await runtime.dispatchFetch(`${origin}/auth/login?returnTo=${encodeURIComponent(path)}`, { redirect: "manual" });
    assert.equal(new URL(unsafe.headers.get("Location")).searchParams.get("redirect_url"), "/");
  }
  const loggedIn = await runtime.dispatchFetch(`${origin}/auth/login?returnTo=/add-recipe.html`, {
    redirect: "manual", headers: { "Cf-Access-Jwt-Assertion": await accessToken() }
  });
  assert.equal(loggedIn.headers.get("Location"), `${origin}/add-recipe.html`);
  const local = await runtime.dispatchFetch("http://localhost/auth/login", { redirect: "manual" });
  assert.equal(local.status, 200);
  assert.match(await local.text(), /LOCAL_USER_EMAIL/);
});

test("local development identity is accepted only on loopback and never deployed hostnames", async () => {
  const localRuntime = new Miniflare(convertV4MiniflareOptions({
    modules: ["src/index.js", "src/identity.js", "src/organisation.js", "public/js/recipe-files.js", "public/js/recipe-library.js", "public/js/ingredient-quantity.js"].map(path => ({ type: "ESModule", path })),
    compatibilityDate: "2026-09-22",
    d1Databases: ["DB"],
    bindings: { LOCAL_USER_EMAIL: "marc@blackhawkdown.org.uk" }
  }));
  try {
    const localDb = await localRuntime.getD1Database("DB");
    for (const path of ["0001_initial_schema", "0002_recipe_editing", "0003_recipe_yield", "0004_ingredient_quantity_text", "0005_recipe_activity", "0006_organisation", "0007_correct_marc_email", "0008_organisations", "0009_organisation_types_and_test_member", "0010_recipe_sections"]) {
      const sql = await readFile(`migrations/${path}.sql`, "utf8");
      for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) await localDb.prepare(statement).run();
    }
    const local = await localRuntime.dispatchFetch("http://localhost/api/session");
    assert.equal(local.status, 200);
    const session = await local.json();
    assert.equal(session.name, "Marc Daffern");
    assert.equal(session.development, true);
    assert.equal(session.admin, true);
    assert.equal(session.organisation.id, "william-cecil");
    assert.equal(session.organisations.length, 2);
    const hosted = await localRuntime.dispatchFetch("https://kitchen-ops.marcs-apps.workers.dev/api/session");
    assert.equal(hosted.status, 401);
  } finally { await localRuntime.dispose(); }
});

test("organisation API restricts access to admins and supports persistent user management", async () => {
  const path = "/api/organisation";
  const anonymous = await runtime.dispatchFetch(`http://localhost${path}`);
  assert.equal(anonymous.status, 401);
  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    const denied = await request(method === "PUT" || method === "DELETE" ? `${path}/marc-daffern` : path, method,
      ["POST", "PUT"].includes(method) ? { name: "Intruder", position: "Chef", admin: true } : undefined, null, "alex_biggs@hotmail.com");
    assert.equal(denied.status, 403);
  }
  const listed = await request(path);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.users.length, 7);
  assert.equal(listed.body.users.find(row => row.id === "liam-goodwill").admin, true);
  const created = await request(path, "POST", { name: "New chef", position: "Chef", email: "", admin: false });
  assert.equal(created.status, 201);
  const id = created.body.id;
  const edited = await request(`${path}/${id}`, "PUT", { name: "New chef renamed", position: "Sous", email: "  NEW@EXAMPLE.COM  ", admin: true });
  assert.equal(edited.status, 200);
  const newSession = await request("/api/session", "GET", undefined, null, "new@example.com");
  assert.equal(newSession.body.admin, true);
  assert.equal(newSession.body.name, "New chef renamed");
  const duplicate = await request(path, "POST", { name: "Duplicate", position: "Chef", email: "NEW@example.com", admin: false });
  assert.equal(duplicate.status, 409);
  const invalid = await request(path, "POST", { name: "Chef", position: "Chef", email: "bad-email", admin: false });
  assert.equal(invalid.status, 400);
  const adminNoEmail = await request(path, "POST", { name: "Chef", position: "Chef", admin: true });
  assert.equal(adminNoEmail.status, 400);
  const recipe = await request("/api/recipes", "POST", original("Managed user recipe"), null, "new@example.com");
  assert.equal(recipe.status, 201);
  const removed = await request(`${path}/${id}`, "DELETE");
  assert.equal(removed.status, 200);
  assert.equal((await request(path)).body.users.some(row => row.id === id), false);
  assert.equal((await request("/api/session", "GET", undefined, null, "new@example.com")).body.admin, false);
  const history = await request(`/api/recipes/${recipe.body.slug}`);
  assert.equal(history.body.activity[0].name, "New chef renamed");
  assert.equal(history.body.activity[0].position, "Sous");
});

test("the last admin cannot be removed or demoted, and changes take effect immediately", async () => {
  const liam = { name: "Liam Goodwill", position: "Exec Chef", email: "liam@woodford.group", admin: false };
  assert.equal((await request("/api/organisation/liam-goodwill", "PUT", liam)).status, 200);
  try {
    assert.equal((await request("/api/session", "GET", undefined, null, liam.email)).body.admin, false);
    assert.equal((await request("/api/organisation/marc-daffern", "DELETE")).status, 409);
    assert.equal((await request("/api/organisation/marc-daffern", "PUT", { name: "Marc Daffern", position: "Commis", email: "marc@blackhawkdown.org.uk", admin: false })).status, 409);
    assert.equal((await request("/api/session")).body.admin, true);
  } finally {
    assert.equal((await request("/api/organisation/liam-goodwill", "PUT", { ...liam, admin: true })).status, 200);
  }
});


test("ingredient quantities compact measurement symbols and space countable items on reads and saves", async () => {
  const inputs = ["200 g", "2boxes", "0.5 kg", "250 ml", "2–3cloves", "1/2tsp", "1 1/2cups", "½box", "to taste", "2 x 400g", "2 to 3 boxes", null];
  const expected = ["200g", "2 boxes", "0.5kg", "250ml", "2–3 cloves", "1/2 tsp", "1 1/2 cups", "½ box", "to taste", "2 x 400g", "2 to 3 boxes", null];
  const recipe = original("Quantity formatting recipe");
  recipe.ingredients = inputs.map((quantity, index) => ({ name: `Ingredient ${index}`, quantity }));
  const created = await request("/api/recipes", "POST", recipe);
  assert.equal(created.status, 201);
  assert.deepEqual((await request(`/api/recipes/${created.body.slug}`)).body.ingredients.map(row => row.quantity), expected);
  await db.prepare("UPDATE ingredients SET quantity = '2boxes' WHERE recipe_id = ? AND sort_order = 1").bind(created.body.id).run();
  assert.equal((await request(`/api/recipes/${created.body.slug}`)).body.ingredients[0].quantity, "2 boxes");
  const edited = await request(`/api/recipes/${created.body.slug}`, "PUT", { ...recipe, ingredients: [{ name: "Stock", quantity: 2, unit: "boxes" }, { name: "Flour", quantity: 200, unit: "g" }] });
  assert.equal(edited.status, 200);
  assert.deepEqual((await request(`/api/recipes/${created.body.slug}`)).body.ingredients.map(row => row.quantity), ["2 boxes", "200g"]);
});

const familyRequest = (path, method = "GET", body, email = "marc@blackhawkdown.org.uk", photo) =>
  request(path, method, body, photo, email, "daffern-family");

test("migration seeds two isolated organisations and preserves existing membership permissions", async () => {
  const hotel = await request("/api/session");
  assert.deepEqual(hotel.body.organisation, { id: "william-cecil", name: "William Cecil", type: "professional" });
  assert.equal(hotel.body.canEdit, true);
  assert.equal(hotel.body.organisations.length, 2);
  const family = await familyRequest("/api/session");
  assert.equal(family.body.organisation.name, "Daffern Family");
  assert.equal(family.body.access, "admin");
  const users = (await familyRequest("/api/organisation")).body.users;
  assert.deepEqual(users.map(user => [user.name, user.position, user.access]), [
    ["Marc", "Chef", "member"], ["Marc Daffern", "Chef", "admin"], ["Toby Daffern", "Mush", "member"], ["William Daffern", "Mush", "member"]
  ]);
  const toby = await request("/api/session", "GET", undefined, null, "toby.daffern@outlook.com");
  assert.equal(toby.body.organisations.length, 1);
  assert.equal(toby.body.organisation.id, "daffern-family");
  assert.equal(toby.body.canEdit, false);
  const alex = await request("/api/session", "GET", undefined, null, "alex_biggs@hotmail.com");
  assert.equal(alex.body.access, "member");
  assert.equal(alex.body.organisations.length, 1);
  assert.equal((await db.prepare("SELECT organisation_id FROM recipes WHERE id = 9000").first()).organisation_id, "william-cecil");
});

test("organisations cannot read, change or discover each other's recipes and ingredients", async () => {
  assert.equal((await familyRequest("/api/recipes")).body.recipes.length, 0);
  const hotel = await request("/api/recipes", "POST", { name: "Shared dish name", ingredients: [{ name: "HotelSecretIngredient" }] });
  const family = await familyRequest("/api/recipes", "POST", { name: "Shared dish name", ingredients: [{ name: "FamilySecretIngredient" }] });
  assert.equal(hotel.status, 201);
  assert.equal(family.status, 201);
  assert.notEqual(hotel.body.slug, family.body.slug);
  assert.equal((await familyRequest("/api/recipes", "POST", { name: "Shared dish name" })).status, 409);
  assert.equal((await familyRequest(`/api/recipes/${hotel.body.slug}`)).status, 404);
  assert.equal((await familyRequest(`/api/recipes/${hotel.body.slug}`, "PUT", { name: "Attempted overwrite" })).status, 404);
  assert.equal((await familyRequest(`/api/recipes/${hotel.body.slug}`, "DELETE")).status, 404);
  assert.equal((await request(`/api/recipes/${family.body.slug}`)).status, 404);
  assert.equal((await request(`/api/recipes/${family.body.slug}`, "PUT", { name: "Attempted overwrite" })).status, 404);
  assert.equal((await request(`/api/recipes/${family.body.slug}`, "DELETE")).status, 404);
  assert.equal((await familyRequest("/api/ingredients?q=Hotel")).body.ingredients.length, 0);
  assert.equal((await request("/api/ingredients?q=Family")).body.ingredients.length, 0);
  assert.deepEqual((await familyRequest("/api/ingredients?q=Family")).body.ingredients, ["FamilySecretIngredient"]);
  assert.equal((await familyRequest("/api/recipes?source_file=dishes%2Fsalmon-ceviche.html")).body.recipes.length, 0);
  assert.equal((await familyRequest("/api/recipes", "POST", { name: "Steal archived recipe", source_file: "dishes/salmon-ceviche.html" })).status, 400);
  assert.equal((await request(`/api/recipes/${hotel.body.slug}`)).body.name, "Shared dish name");
});

test("unlisted users and forged organisation selections cannot access organisation data", async () => {
  for (const path of ["/api/recipes", "/api/ingredients?q=Butter", "/api/organisation"]) {
    assert.equal((await request(path, "GET", undefined, null, "stranger@example.com")).status, 403);
    assert.equal((await request(path, "GET", undefined, null, "toby.daffern@outlook.com", "william-cecil")).status, 403);
    assert.equal((await request(path, "GET", undefined, null, undefined, "does-not-exist")).status, 403);
    assert.equal((await runtime.dispatchFetch(`http://localhost${path}`)).status, 401);
  }
  assert.equal((await request("/api/recipes", "POST", { name: "Unlisted recipe" }, null, "stranger@example.com")).status, 403);
  const session = await request("/api/session", "GET", undefined, null, "stranger@example.com");
  assert.equal(session.body.organisation, null);
  assert.deepEqual(session.body.organisations, []);
});

test("members create but cannot edit their own recipes; editors edit but cannot delete or manage members", async () => {
  const email = "toby.daffern@outlook.com";
  const created = await familyRequest("/api/recipes", "POST", { name: "Toby recipe", organisation_id: "william-cecil" }, email);
  assert.equal(created.status, 201);
  assert.equal(created.body.organisation_id, "daffern-family");
  const path = `/api/recipes/${created.body.slug}`;
  assert.equal((await familyRequest(path, "PUT", { name: "New name" }, email)).status, 403);
  assert.equal((await familyRequest(path, "DELETE", undefined, email)).status, 403);
  assert.equal((await familyRequest("/api/organisation", "GET", undefined, email)).status, 403);
  assert.equal((await familyRequest("/api/organisation/daffern-family-toby", "PUT", {
    name: "Toby Daffern", position: "Mush", email, access: "editor"
  })).status, 200);
  try {
    assert.equal((await familyRequest("/api/session", "GET", undefined, email)).body.canEdit, true);
    assert.equal((await familyRequest(path, "PUT", { name: "Updated by editor" }, email)).status, 200);
    assert.equal((await familyRequest(path, "DELETE", undefined, email)).status, 403);
    assert.equal((await familyRequest("/api/organisation", "POST", { name: "Intruder", position: "Chef", access: "admin", email: "intruder@example.com" }, email)).status, 403);
  } finally {
    await familyRequest("/api/organisation/daffern-family-toby", "PUT", { name: "Toby Daffern", position: "Mush", email, access: "member" });
  }
});

test("admin powers and last-admin protection are scoped to each organisation", async () => {
  assert.equal((await familyRequest("/api/organisation/marc-daffern", "DELETE")).status, 409);
  assert.equal((await familyRequest("/api/organisation/liam-goodwill", "PUT", { name: "Changed", position: "Chef", email: "liam@woodford.group", access: "member" })).status, 409);
  assert.equal((await familyRequest("/api/organisation/daffern-family-marc", "DELETE")).status, 409);
  assert.equal((await familyRequest("/api/organisation/daffern-family-marc", "PUT", { name: "Marc Daffern", position: "Chef", email: "marc@blackhawkdown.org.uk", access: "editor" })).status, 409);
  assert.equal((await familyRequest("/api/session")).body.admin, true);
  const added = await request("/api/organisation", "POST", { name: "Toby at work", position: "Commis", email: "toby.daffern@outlook.com", access: "member" });
  assert.equal(added.status, 201);
  assert.equal((await familyRequest("/api/session", "GET", undefined, "toby.daffern@outlook.com")).body.organisations.length, 2);
  assert.equal((await request(`/api/organisation/${added.body.id}`, "DELETE")).status, 200);
  assert.equal((await request("/api/recipes", "GET", undefined, null, "toby.daffern@outlook.com", "william-cecil")).status, 403);
  assert.equal((await familyRequest("/api/session", "GET", undefined, "toby.daffern@outlook.com")).body.organisations.length, 1);
});

test("uploaded photos require membership of their owning organisation and cannot be cached publicly", async () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const created = await familyRequest("/api/recipes", "POST", { name: "Private family photo" }, undefined, png);
  assert.equal(created.status, 201);
  const photo = created.body.image_path;
  const url = `http://localhost${photo}?organisation=daffern-family`;
  const headers = { "Cf-Access-Jwt-Assertion": await accessToken("toby.daffern@outlook.com") };
  const allowed = await runtime.dispatchFetch(url, { headers });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await runtime.dispatchFetch(url)).status, 401);
  assert.equal((await runtime.dispatchFetch(url, { headers: { "Cf-Access-Jwt-Assertion": await accessToken("liam@woodford.group") } })).status, 403);
  assert.equal((await runtime.dispatchFetch(`http://localhost${photo}`, { headers: { "Cf-Access-Jwt-Assertion": await accessToken() } })).status, 404);
  assert.equal((await request(`/api/recipes/${created.body.slug}`, "GET")).status, 404);
});


test("legacy photo files cannot bypass membership checks through static asset routing", async () => {
  const photo = "http://localhost/images/salmon-ceviche.jpg";
  const allowed = await runtime.dispatchFetch(photo, { headers: { "Cf-Access-Jwt-Assertion": await accessToken() } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await runtime.dispatchFetch(photo)).status, 404);
  assert.equal((await runtime.dispatchFetch(photo, { headers: { "Cf-Access-Jwt-Assertion": await accessToken("toby.daffern@outlook.com") } })).status, 404);
  for (const path of ["/imag%65s/salmon-ceviche.jpg", "/images%2Fsalmon-ceviche.jpg", "/%2569mages/salmon-ceviche.jpg"]) {
    assert.equal((await runtime.dispatchFetch(`http://localhost${path}`)).status, 404);
  }
  assert.deepEqual((await db.prepare("PRAGMA foreign_key_check").all()).results, []);
});


test("Marc's test email has only Member access to the Lite family organisation", async () => {
  const email = "marcdaffern@hotmail.com";
  const session = await request("/api/session", "GET", undefined, null, email);
  assert.equal(session.status, 200);
  assert.equal(session.body.name, "Marc");
  assert.equal(session.body.access, "member");
  assert.equal(session.body.admin, false);
  assert.equal(session.body.canEdit, false);
  assert.deepEqual(session.body.organisations, [{ id: "daffern-family", name: "Daffern Family", type: "lite" }]);
  assert.equal(session.body.organisation.type, "lite");
  assert.equal((await request("/api/recipes", "GET", undefined, null, email, "william-cecil")).status, 403);
  assert.equal((await familyRequest("/api/organisation", "GET", undefined, email)).status, 403);
  const created = await familyRequest("/api/recipes", "POST", { name: "Marc test member recipe" }, email);
  assert.equal(created.status, 201);
  assert.equal((await familyRequest(`/api/recipes/${created.body.slug}`, "PUT", { name: "Cannot edit own recipe" }, email)).status, 403);
  assert.equal((await familyRequest(`/api/recipes/${created.body.slug}`, "DELETE", undefined, email)).status, 403);
  const primary = await familyRequest("/api/session");
  assert.equal(primary.body.access, "admin");
  assert.equal(primary.body.organisations.length, 2);
});

test("section migration seeds William Cecil and assigns its existing recipes to Larder", async () => {
  const sections = await request("/api/sections");
  assert.equal(sections.status, 200);
  assert.deepEqual(sections.body.sections.map(row => row.name), ["Larder", "Pastry", "Sauce", "Shared"]);
  const recipe = await request("/api/recipes/migration-recipe");
  assert.equal(recipe.body.section_id, "william-cecil-larder");
  assert.equal(recipe.body.section_name, "Larder");
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM recipe_sections WHERE organisation_id = 'daffern-family'").first()).n, 0);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM recipes WHERE organisation_id = 'daffern-family' AND section_id IS NOT NULL").first()).n, 0);
});

test("admins manage sections; renaming updates recipe labels and deleting preserves recipe contents", async () => {
  const created = await request("/api/sections", "POST", { name: "  Development  " });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(created.body.name, "Development");
  const recipe = await request("/api/recipes", "POST", { ...original("Section lifecycle recipe"), section_id: id });
  assert.equal(recipe.status, 201);
  const before = (await request(`/api/recipes/${recipe.body.slug}`)).body;
  assert.equal(before.section_name, "Development");
  const renamed = await request(`/api/sections/${id}`, "PUT", { name: "Development kitchen" });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.id, id);
  assert.equal((await request(`/api/recipes/${recipe.body.slug}`)).body.section_name, "Development kitchen");
  assert.equal((await request("/api/recipes")).body.recipes.find(row => row.id === recipe.body.id).section_name, "Development kitchen");
  assert.equal((await request(`/api/sections/${id}`, "DELETE")).status, 200);
  const after = (await request(`/api/recipes/${recipe.body.slug}`)).body;
  assert.equal(after.section_id, null);
  assert.equal(after.section_name, null);
  for (const key of ["id", "slug", "name", "ingredients", "steps", "activity", "created_at", "updated_at"]) assert.deepEqual(after[key], before[key]);
  assert.equal((await request(`/api/sections/${id}`, "DELETE")).status, 404);
  assert.equal((await request(`/api/sections/${id}`, "PUT", { name: "Missing" })).status, 404);
});

test("section names are validated and unique within an organisation", async () => {
  for (const name of ["", "   ", "x".repeat(81), null, 42, {}, []]) {
    assert.equal((await request("/api/sections", "POST", { name })).status, 400);
  }
  assert.equal((await request("/api/sections", "POST", { name: " larder " })).status, 409);
  assert.equal((await request("/api/sections/william-cecil-sauce", "PUT", { name: "LARDER" })).status, 409);
});

test("members can list and assign sections when creating but only admins manage them", async () => {
  const email = "alex_biggs@hotmail.com";
  assert.equal((await request("/api/sections", "GET", undefined, null, email)).status, 200);
  for (const [path, method, body] of [["/api/sections", "POST", { name: "Forbidden" }], ["/api/sections/william-cecil-larder", "PUT", { name: "Forbidden" }], ["/api/sections/william-cecil-larder", "DELETE"]]) {
    assert.equal((await request(path, method, body, null, email)).status, 403);
  }
  const recipe = await request("/api/recipes", "POST", { name: "Member assigned recipe", section_id: "william-cecil-sauce" }, null, email);
  assert.equal(recipe.status, 201);
  assert.equal(recipe.body.section_id, "william-cecil-sauce");
  assert.equal((await request(`/api/recipes/${recipe.body.slug}`, "PUT", { name: "Changed", section_id: "william-cecil-pastry" }, null, email)).status, 403);
  const edited = await request(`/api/recipes/${recipe.body.slug}`, "PUT", { name: "Assigned by admin", section_id: "william-cecil-pastry" });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.section_id, "william-cecil-pastry");
  assert.equal((await request(`/api/recipes/${recipe.body.slug}`, "PUT", { name: "Legacy edit without section" })).body.section_id, "william-cecil-pastry");
  assert.equal((await request(`/api/recipes/${recipe.body.slug}`, "PUT", { name: "Explicitly unassigned", section_id: null })).body.section_id, null);
  assert.equal((await request("/api/recipes", "POST", { name: "Optional section" })).body.section_id, null);
  for (const section_id of ["not-real", 42, {}]) assert.equal((await request("/api/recipes", "POST", { name: "Bad section", section_id })).status, 400);
});

test("sections are unavailable to Lite organisations and cannot be accessed across organisations", async () => {
  for (const [path, method, body] of [["/api/sections", "GET"], ["/api/sections", "POST", { name: "Forbidden" }], ["/api/sections/william-cecil-larder", "PUT", { name: "Forbidden" }], ["/api/sections/william-cecil-larder", "DELETE"]]) {
    assert.equal((await familyRequest(path, method, body)).status, 403);
  }
  assert.equal((await familyRequest("/api/recipes", "POST", { name: "Family section blocked", section_id: "william-cecil-larder" })).status, 400);
  await db.prepare("INSERT INTO organisations (id, name, type) VALUES ('section-test', 'Other professional kitchen', 'professional')").run();
  await db.prepare("INSERT INTO organisation_users (id, name, position, email, admin, access, organisation_id) VALUES ('section-admin', 'Other admin', 'Chef', 'section-admin@example.com', 1, 'admin', 'section-test')").run();
  const other = (path, method = "GET", body) => request(path, method, body, null, "section-admin@example.com", "section-test");
  assert.deepEqual((await other("/api/sections")).body.sections, []);
  const created = await other("/api/sections", "POST", { name: "Larder" });
  assert.equal(created.status, 201);
  const foreign = created.body.id;
  assert.equal((await request(`/api/sections/${foreign}`, "PUT", { name: "Stolen" })).status, 404);
  assert.equal((await request(`/api/sections/${foreign}`, "DELETE")).status, 404);
  assert.equal((await request("/api/recipes", "POST", { name: "Foreign section", section_id: foreign })).status, 400);
  assert.equal((await other("/api/recipes", "POST", { name: "Foreign hotel section", section_id: "william-cecil-larder" })).status, 400);
  assert.equal((await other("/api/sections/william-cecil-larder", "DELETE")).status, 404);
  assert.deepEqual((await db.prepare("PRAGMA foreign_key_check").all()).results, []);
});


test("private recipes restrict lists, direct reads, writes, photos and suggestions to their creator", async () => {
  const created = await request("/api/recipes", "POST", {
    ...original("Private recipe test"), is_private: true,
    ingredients: [{ name: "Privateuniquebutter" }], creator_id: "forged"
  }, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(created.status, 201);
  const path = `/api/recipes/${created.body.slug}`;
  assert.equal((await request(path)).status, 200);
  const other = "alex_biggs@hotmail.com";
  const otherRequest = (url, method = "GET", body) => request(url, method, body, null, other);
  assert.equal((await otherRequest(path)).status, 404);
  assert.ok(!(await otherRequest("/api/recipes")).body.recipes.some(row => row.slug === created.body.slug));
  assert.deepEqual((await otherRequest("/api/ingredients?q=Privateunique")).body.ingredients, []);
  await db.prepare("UPDATE organisation_users SET admin = 1, access = 'admin' WHERE lower(email) = ?").bind(other).run();
  try {
    assert.equal((await otherRequest(path, "PUT", { name: "Stolen", is_private: false })).status, 404);
    assert.equal((await otherRequest(path, "DELETE")).status, 404);
    const photo = new URL(created.body.image_path, "http://localhost");
    assert.equal((await runtime.dispatchFetch(photo, { headers: { "Cf-Access-Jwt-Assertion": await accessToken(other) } })).status, 404);
    assert.equal((await runtime.dispatchFetch(photo, { headers: { "Cf-Access-Jwt-Assertion": await accessToken() } })).status, 200);
    assert.equal((await request(path, "PUT", { ...original("Private recipe test"), is_private: false })).status, 200);
    assert.equal((await otherRequest(path)).status, 200);
    assert.equal((await otherRequest(path, "PUT", { name: "Cannot privatise", is_private: true })).status, 403);
  } finally {
    await db.prepare("UPDATE organisation_users SET admin = 0, access = 'member' WHERE lower(email) = ?").bind(other).run();
  }
});
