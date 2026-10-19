import { updateAdminMenu } from "./admin-menu.js";

function login() {
  const destination = window.location.pathname + window.location.search;
  window.location.assign(`/auth/login?returnTo=${encodeURIComponent(destination)}`);
}

export async function requireSession() {
  let response;
  try {
    response = await fetch("/api/session", { cache: "no-store", redirect: "manual" });
  } catch {
    throw new Error("Could not check your session. Check your connection and try again.");
  }
  // Access may intercept the request before it reaches our API.
  if (response.type === "opaqueredirect" || response.status === 401 || response.status === 403) {
    updateAdminMenu(null);
    login();
    return false;
  }
  if (!response.ok) throw new Error("Could not check your session. Please try again.");
  const session = await response.json();
  if (!session.authenticated) {
    updateAdminMenu(null);
    login();
    return false;
  }
  updateAdminMenu(session);
  return session;
}
