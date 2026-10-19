export function updateAdminMenu(session) {
  let menu = document.getElementById("admin-menu");
  document.body.classList.toggle("has-admin-menu", session?.admin === true);
  if (!session?.admin) {
    menu?.remove();
    return;
  }
  if (menu) return;
  menu = document.createElement("nav");
  menu.id = "admin-menu";
  menu.className = "admin-menu";
  menu.setAttribute("aria-label", "Administration");
  menu.innerHTML = `
    <button id="admin-menu-toggle" type="button" aria-label="Open admin menu" aria-expanded="false" aria-controls="admin-menu-links">☰</button>
    <div id="admin-menu-links" hidden>
      <a href="/">Home</a>
      <a href="/organisation.html">Manage Organisation</a>
    </div>`;
  document.body.prepend(menu);
  const toggle = menu.querySelector("button");
  const links = menu.querySelector("div");
  function close() {
    links.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  }
  toggle.addEventListener("click", () => {
    links.hidden = !links.hidden;
    toggle.setAttribute("aria-expanded", String(!links.hidden));
  });
  document.addEventListener("click", event => { if (!menu.contains(event.target)) close(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !links.hidden) { close(); toggle.focus(); }
  });
}
