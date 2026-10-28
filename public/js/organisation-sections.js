import { organisationFetch, requireSession } from "./session.js";

export async function initialiseSections(session) {
  if (session.organisation.type !== "professional") return;
  const panel = document.getElementById("section-management");
  const list = document.getElementById("section-list");
  const dialog = document.getElementById("section-dialog");
  const form = document.getElementById("section-form");
  const error = document.getElementById("section-error");
  const removeDialog = document.getElementById("delete-section-dialog");
  const removeError = document.getElementById("delete-section-error");
  const status = document.getElementById("section-status");
  let editing = null;
  let removing = null;
  let busy = false;

  async function api(path = "", options = {}) {
    const response = await organisationFetch(`/api/sections${path}`, options);
    if (response.status === 401 || response.type === "opaqueredirect") {
      await requireSession();
      throw new Error("Please sign in again.");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not update sections.");
    return data;
  }
  function setBusy(value) {
    busy = value;
    for (const control of document.querySelectorAll("#section-dialog button, #section-dialog input, #delete-section-dialog button")) control.disabled = value;
  }
  function edit(section = null) {
    editing = section;
    form.reset();
    form.elements.name.value = section?.name || "";
    error.textContent = "";
    document.getElementById("section-dialog-title").textContent = section ? "Edit section" : "Add section";
    dialog.showModal();
    form.elements.name.focus();
  }
  async function load() {
    const { sections } = await api();
    list.replaceChildren();
    for (const section of sections) {
      const item = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = section.name;
      const actions = document.createElement("span");
      actions.className = "team-actions";
      for (const label of ["Edit", "Remove"]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.setAttribute("aria-label", `${label} section ${section.name}`);
        button.addEventListener("click", () => {
          if (label === "Edit") edit(section);
          else {
            removing = section;
            removeError.textContent = "";
            document.getElementById("delete-section-description").textContent = `Remove ${section.name}?`;
            removeDialog.showModal();
          }
        });
        actions.append(button);
      }
      item.append(name, actions);
      list.append(item);
    }
    status.textContent = sections.length ? "" : "No sections yet. Add a section to organise recipes.";
  }
  document.getElementById("add-section").addEventListener("click", () => edit());
  document.getElementById("cancel-section").addEventListener("click", () => dialog.close());
  document.getElementById("cancel-delete-section").addEventListener("click", () => removeDialog.close());
  for (const modal of [dialog, removeDialog]) modal.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  async function refresh(message) {
    const current = await requireSession();
    if (!current?.admin) { panel.hidden = true; throw new Error("Your admin access has changed."); }
    await load();
    status.textContent = message;
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const body = JSON.stringify({ name: form.elements.name.value });
    setBusy(true);
    error.textContent = "";
    try {
      await api(editing ? `/${encodeURIComponent(editing.id)}` : "", {
        method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body
      });
      await refresh("Section saved.");
      dialog.close();
    } catch (failure) { error.textContent = failure.message; }
    finally { setBusy(false); }
  });
  document.getElementById("confirm-delete-section").addEventListener("click", async () => {
    if (busy || !removing) return;
    setBusy(true);
    removeError.textContent = "";
    try {
      await api(`/${encodeURIComponent(removing.id)}`, { method: "DELETE" });
      await refresh("Section removed. Its recipes are now unassigned.");
      removeDialog.close();
    } catch (failure) { removeError.textContent = failure.message; }
    finally { setBusy(false); }
  });
  await load();
  panel.hidden = false;
}
