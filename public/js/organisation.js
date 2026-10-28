import { requireSession, organisationFetch } from "./session.js";

import { initialiseSections } from "./organisation-sections.js";

const status = document.getElementById("organisation-status");
const content = document.getElementById("organisation-content");
const tbody = document.getElementById("team-users");
const userDialog = document.getElementById("user-dialog");
const form = document.getElementById("user-form");
const userError = document.getElementById("user-error");
const removeDialog = document.getElementById("remove-dialog");
const removeError = document.getElementById("remove-error");
let users = [];
let editing = null;
let removing = null;
let busy = false;

async function api(path = "", options = {}) {
  const response = await organisationFetch(`/api/organisation${path}`, { ...options, cache: "no-store", redirect: "manual" });
  if (response.type === "opaqueredirect" || response.status === 401) {
    await requireSession();
    throw new Error("Your session has expired. Please sign in again.");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load the organisation.");
  return data;
}

function render() {
  tbody.replaceChildren();
  document.getElementById("team-count").textContent = `(${users.length})`;
  for (const user of users) {
    const tr = document.createElement("tr");
    for (const value of [user.name, user.position, user.email || "Email not added", ({ member: "Member", editor: "Editor", admin: "Admin" })[user.access]]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    const actions = document.createElement("td");
    actions.className = "team-actions";
    for (const [label, action] of [["Edit", () => openUser(user)], ["Remove", () => openRemove(user)]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-label", `${label} ${user.name}`);
      button.addEventListener("click", action);
      actions.append(button);
    }
    tr.append(actions);
    tbody.append(tr);
  }
}

async function load() {
  users = (await api()).users;
  render();
}

function openUser(user = null) {
  editing = user;
  form.reset();
  form.elements.name.value = user?.name || "";
  form.elements.position.value = user?.position || "";
  form.elements.email.value = user?.email || "";
  form.elements.access.value = user?.access || "member";
  userError.textContent = "";
  document.getElementById("user-dialog-title").textContent = user ? "Edit user" : "Add user";
  userDialog.showModal();
  form.elements.name.focus();
}

function openRemove(user) {
  removing = user;
  removeError.textContent = "";
  document.getElementById("remove-description").textContent = `Remove ${user.name} from the organisation?`;
  removeDialog.showModal();
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll("dialog button, dialog input, dialog select").forEach(control => { control.disabled = value; });
}
for (const dialog of [userDialog, removeDialog]) {
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
}
document.getElementById("add-user").addEventListener("click", () => openUser());
document.getElementById("cancel-user").addEventListener("click", () => userDialog.close());
document.getElementById("cancel-remove").addEventListener("click", () => removeDialog.close());

async function refreshAfterChange(message) {
  const session = await requireSession();
  if (!session) return;
  if (!session.admin) {
    content.hidden = true;
    status.textContent = "Your admin access has changed. Return to the recipe board to continue.";
    return;
  }
  await load();
  status.textContent = message;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  const body = { name: form.elements.name.value, position: form.elements.position.value,
    email: form.elements.email.value, access: form.elements.access.value };
  setBusy(true);
  userError.textContent = "";
  try {
    await api(editing ? `/${encodeURIComponent(editing.id)}` : "", {
      method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    userDialog.close();
    await refreshAfterChange("User saved.");
  } catch (error) { userError.textContent = error.message; }
  finally { setBusy(false); }
});

document.getElementById("confirm-remove").addEventListener("click", async () => {
  if (busy || !removing) return;
  setBusy(true);
  try {
    await api(`/${encodeURIComponent(removing.id)}`, { method: "DELETE" });
    removeDialog.close();
    await refreshAfterChange("User removed. Recipe history has been preserved.");
  } catch (error) { removeError.textContent = error.message; }
  finally { setBusy(false); }
});

try {
  const session = await requireSession();
  if (session && !session.admin) status.textContent = "Only admins can manage the organisation.";
  else if (session) {
    await load();
    content.hidden = false;
    status.textContent = "";
    await initialiseSections(session);
  }
} catch (error) { status.textContent = error.message; }
