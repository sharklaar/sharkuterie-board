document.addEventListener("DOMContentLoaded", () => {
  const header = document.createElement("header");
  header.className = "global-nav";
  header.innerHTML = `
    <nav class="nav-inner" aria-label="Site navigation">
      <a href="/index.html">Home</a>
      <a href="/plating/index.html">Plating</a>
      <a href="/prep/index.html">Prep</a>
      <a href="/recipes/index.html">Recipes</a>
      <a href="/lessons/index.html">Mistakes</a>
    </nav>
  `;
  document.body.prepend(header);

  const footer = document.createElement("footer");
  footer.className = "global-footer";
  footer.innerHTML = `<p>Kitchen Logbook</p>`;
  document.body.appendChild(footer);
});