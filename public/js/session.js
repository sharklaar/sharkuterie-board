import { updateAdminMenu } from "./admin-menu.js";

// Keep organisation context per tab. Every request from an open editor stays pinned
// to that tab's organisation, even when another tab switches organisations.
let organisationId = sessionStorage.getItem("organisation-id");
export function organisationFetch(path, options = {}) {
  const headers = new Headers(options.headers);
  if (organisationId) headers.set("X-Organisation-Id", organisationId);
  return fetch(path, { ...options, headers, cache: "no-store", redirect: "manual" });
}
export function organisationImage(path) {
  if (!path?.startsWith("/media/recipe-images/") || !organisationId) return path;
  return `${path}?organisation=${encodeURIComponent(organisationId)}`;
}

function updateHeader(session) {
  let header = document.getElementById("organisation-header");
  if (!header) {
    header = document.createElement("header");
    header.id = "organisation-header";
    header.className = "organisation-header";
    document.body.prepend(header);
  }
  header.replaceChildren();
  const left = document.createElement("div");
  left.className = "organisation-identity";
  if (session.organisations.length > 1) {
    const label = document.createElement("label");
    label.className = "visually-hidden";
    label.htmlFor = "organisation-selector";
    label.textContent = "Organisation";
    const select = document.createElement("select");
    select.id = "organisation-selector";
    for (const org of session.organisations) {
      const option = document.createElement("option");
      option.value = org.id;
      option.textContent = org.name;
      select.append(option);
    }
    if (!session.organisation) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Choose organisation";
      placeholder.disabled = true;
      select.prepend(placeholder);
    }
    select.value = session.organisation?.id || "";
    select.addEventListener("change", () => {
      if (document.getElementById("recipe-form")?.dataset.dirty === "true" &&
          !window.confirm("Switch organisation and discard this recipe's unsaved changes?")) {
        select.value = session.organisation?.id || "";
        return;
      }
      sessionStorage.setItem("organisation-id", select.value);
      window.location.assign("/");
    });
    left.append(label, select);
  } else {
    left.textContent = session.organisation?.name || "No organisation access";
  }
  const right = document.createElement("span");
  right.className = "organisation-current-user";
  right.textContent = session.name || session.email;
  right.title = `${session.email} · ${session.access || "No access"}`;
  header.append(left, right);
  // The shared header replaces the board's old floating name label.
  document.getElementById("current-user")?.remove();
}

function login() {
  const destination = window.location.pathname + window.location.search;
  window.location.assign(`/auth/login?returnTo=${encodeURIComponent(destination)}`);
}

export async function requireSession() {
  let response;
  try {
    response = await organisationFetch("/api/session");
  } catch {
    throw new Error("Could not check your session. Check your connection and try again.");
  }
  if (response.type === "opaqueredirect" || response.status === 401) {
    updateAdminMenu(null);
    login();
    return false;
  }
  if (!response.ok) throw new Error("Could not check your session. Please try again.");
  const session = await response.json();
  if (!session.authenticated) { login(); return false; }
  if (!session.organisation) {
    updateAdminMenu(null);
    updateHeader(session);
    const error = organisationId
      ? "Your access to this organisation has changed. Return to the recipe board and select an available organisation."
      : "Your account has no organisation membership. Please ask an organisation admin to add you.";
    if (organisationId) {
      sessionStorage.removeItem("organisation-id");
      // Do not retry the current request in a different organisation: an editor
      // must never silently save its old content into a different organisation.
    }
    throw new Error(error);
  }
  organisationId = session.organisation.id;
  sessionStorage.setItem("organisation-id", organisationId);
  updateHeader(session);
  updateAdminMenu(session);
  return session;
}
