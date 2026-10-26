import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = (await readFile(new URL("../public/js/session.js", import.meta.url), "utf8"))
  .replace('import { updateAdminMenu } from "./admin-menu.js";', 'const updateAdminMenu = () => {};')
  .replaceAll("export ", "");
const hotel = { id: "william-cecil", name: "William Cecil" };
const family = { id: "daffern-family", name: "Daffern Family" };
const session = (organisation = hotel, organisations = [hotel, family]) => ({
  authenticated: true, organisation, organisations, name: "Marc Daffern", email: "marc@example.com", access: "admin"
});

function fixture(initialOrganisation, sessions) {
  const elements = new Map();
  function element(tag) {
    return { tag, children: [], dataset: {}, listeners: {},
      append(...children) { this.children.push(...children); },
      prepend(...children) { this.children.unshift(...children); },
      replaceChildren(...children) { this.children = children; },
      addEventListener(event, listener) { this.listeners[event] = listener; },
      set id(value) { this._id = value; elements.set(value, this); }, get id() { return this._id; }
    };
  }
  const storage = new Map(initialOrganisation ? [["organisation-id", initialOrganisation]] : []);
  const calls = [];
  const navigations = [];
  const context = vm.createContext({
    Headers,
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    document: { createElement: element, getElementById: id => elements.get(id), body: element("body") },
    window: { location: { pathname: "/add-recipe", search: "", assign: path => navigations.push(path) }, confirm: () => false },
    fetch: async (path, options) => {
      calls.push({ path, organisation: options.headers.get("X-Organisation-Id") });
      return Response.json(sessions.shift() || session());
    }
  });
  vm.runInContext(`${source}\nglobalThis.api = { requireSession, organisationFetch, organisationImage };`, context);
  return { api: context.api, elements, storage, calls, navigations };
}

test("a single organisation shows its name without a selector", async () => {
  const f = fixture(null, [session(family, [family])]);
  await f.api.requireSession();
  assert.equal(f.elements.has("organisation-selector"), false);
  assert.equal(f.elements.get("organisation-header").children[0].textContent, "Daffern Family");
  assert.equal(f.elements.get("organisation-header").children[1].textContent, "Marc Daffern");
  await f.api.organisationFetch("/api/recipes");
  assert.equal(f.calls[1].organisation, "daffern-family");
});

test("multiple memberships show a selector which navigates to a clean board", async () => {
  const f = fixture("william-cecil", [session()]);
  await f.api.requireSession();
  const select = f.elements.get("organisation-selector");
  assert.deepEqual(select.children.map(option => option.textContent), ["William Cecil", "Daffern Family"]);
  select.value = "daffern-family";
  select.listeners.change();
  assert.equal(f.storage.get("organisation-id"), "daffern-family");
  assert.deepEqual(f.navigations, ["/"]);
  // The old document stays pinned while navigation happens; it cannot save
  // a hotel recipe to the family organisation based on changed storage.
  await f.api.organisationFetch("/api/recipes", { method: "POST" });
  assert.equal(f.calls.at(-1).organisation, "william-cecil");
});

test("cancelling a switch preserves unsaved recipe work and the selected organisation", async () => {
  const f = fixture("william-cecil", [session()]);
  await f.api.requireSession();
  f.elements.set("recipe-form", { dataset: { dirty: "true" } });
  const select = f.elements.get("organisation-selector");
  select.value = "daffern-family";
  select.listeners.change();
  assert.equal(select.value, "william-cecil");
  assert.equal(f.storage.get("organisation-id"), "william-cecil");
  assert.deepEqual(f.navigations, []);
});

test("revoked membership never silently retries an open editor in another organisation", async () => {
  const f = fixture("william-cecil", [session(null, [family]), session(null, [family])]);
  await assert.rejects(f.api.requireSession(), /access to this organisation has changed/);
  await assert.rejects(f.api.requireSession(), /access to this organisation has changed/);
  assert.equal(f.storage.has("organisation-id"), false);
  assert.deepEqual(f.calls.map(call => call.organisation), ["william-cecil", "william-cecil"]);
  assert.deepEqual(f.navigations, []);
});

test("photo URLs carry the selected organisation for normal image requests", async () => {
  const f = fixture("daffern-family", []);
  assert.equal(f.api.organisationImage("/media/recipe-images/abc.png"), "/media/recipe-images/abc.png?organisation=daffern-family");
  assert.equal(f.api.organisationImage("/images/salmon.jpg"), "/images/salmon.jpg");
});
