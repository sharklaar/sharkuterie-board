import { dishFiles } from "./recipe-files.js";
import { getRecipeImagePath } from "./recipe-library.js";

const dishList = document.getElementById("dish-list");
const searchInput = document.getElementById("dish-search");
const dishCount = document.getElementById("dish-count");
const noResults = document.getElementById("no-results");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadDishes() {
  try {
    const apiResponse = await fetch("/api/recipes");
    if (!apiResponse.ok) throw new Error("Recipe library could not be loaded");
    const data = await apiResponse.json();
    const replacedFiles = new Set(data.recipes.map(recipe => recipe.source_file).filter(Boolean));
    const activeFiles = dishFiles.filter(file => !replacedFiles.has(file));
    const staticCards = await Promise.all(activeFiles.map(async file => {
      const response = await fetch(file);
      if (!response.ok) throw new Error("Recipe file could not be loaded");
      const template = document.createElement("template");
      template.innerHTML = await response.text();
      const card = template.content.querySelector(".dish-card");
      if (!card) throw new Error("Recipe file could not be read");
      card.dataset.sourceFile = file;
      const actions = document.createElement("div");
      actions.className = "recipe-card-actions";
      const editLink = document.createElement("a");
      editLink.className = "recipe-edit-link";
      editLink.href = `/add-recipe.html?source=${encodeURIComponent(file)}`;
      editLink.textContent = "Edit recipe";
      editLink.setAttribute("aria-label", `Edit ${card.dataset.title}`);
      actions.appendChild(editLink);
      card.querySelector(".dish-content").prepend(actions);
      return card;
    }));

    const databaseDishes = data.recipes.map(recipe => `
      <article class="dish-card database-dish"
        data-title="${escapeHtml(recipe.name)}"
        data-ingredients="${escapeHtml(recipe.ingredient_names || "")}" data-tags="${escapeHtml(recipe.tags || "")}"
        data-slug="${escapeHtml(recipe.slug)}">
        <button class="dish-toggle" type="button" aria-expanded="false">
          <span><strong>${escapeHtml(recipe.name)}</strong><br />
            <span class="dish-meta">${escapeHtml(recipe.description || "Recipe")}</span>
          </span>
        </button>
        <div class="dish-content">
          <div class="recipe-card-actions">
            <a class="recipe-edit-link" href="/add-recipe.html?recipe=${encodeURIComponent(recipe.slug)}"
              aria-label="Edit ${escapeHtml(recipe.name)}">Edit recipe</a>
          </div>
          <div class="database-recipe-content"><p>Loading…</p></div>
        </div>
      </article>
    `);
    dishList.replaceChildren(...staticCards);
    dishList.insertAdjacentHTML("beforeend", databaseDishes.join("\n"));
    initialiseAccordions();
    initialiseSearch();
    updateDishCount();

    const selectedSlug = new URLSearchParams(window.location.search).get("recipe");
    const selectedCard = Array.from(dishList.querySelectorAll(".database-dish"))
      .find(card => card.dataset.slug === selectedSlug);
    if (selectedCard) {
      searchInput.value = selectedCard.dataset.title;
      searchInput.dispatchEvent(new Event("input"));
      selectedCard.classList.add("is-open");
      selectedCard.querySelector(".dish-toggle").setAttribute("aria-expanded", "true");
      await loadDatabaseRecipe(selectedCard);
    }
  } catch (error) {
    console.error(error);
    noResults.textContent = "The recipe library could not be loaded. Please refresh to try again.";
    noResults.hidden = false;
  }
}

function renderGroups(rows, heading, renderItem) {
  const groups = [];
  for (const row of rows) {
    const section = row.section || "";
    const last = groups[groups.length - 1];
    if (last?.section === section) last.rows.push(row);
    else groups.push({ section, rows: [row] });
  }
  const listTag = heading === "Ingredients" ? "ul" : "ol";
  return groups.map(group => `
    <section class="dish-section">
      <h3>${escapeHtml(group.section ? `${heading} · ${group.section}` : heading)}</h3>
      <${listTag}>${group.rows.map(renderItem).join("")}</${listTag}>
    </section>
  `).join("");
}

async function loadDatabaseRecipe(card) {
  if (card.dataset.loaded === "true") return;
  const content = card.querySelector(".database-recipe-content");
  try {
    const response = await fetch(`/api/recipes/${encodeURIComponent(card.dataset.slug)}`);
    if (!response.ok) throw new Error("Recipe could not be loaded");
    const recipe = await response.json();
    const imagePath = getRecipeImagePath(recipe.image_path);
    const imageHtml = imagePath
      ? `<img class="database-recipe-image" src="${escapeHtml(imagePath)}" alt="${escapeHtml(recipe.name)}" loading="lazy" />`
      : "";
    const ingredientsHtml = renderGroups(recipe.ingredients, "Ingredients", ingredient => `
      <li>${escapeHtml(ingredient.quantity ?? "")} ${escapeHtml(ingredient.unit || "")}
        ${escapeHtml(ingredient.name)}${ingredient.notes ? ` — ${escapeHtml(ingredient.notes)}` : ""}</li>
    `);
    const stepsHtml = renderGroups(recipe.steps, "Method", step => `
      <li>
        ${step.time_offset_minutes != null ? `<span class="step-timing">T+ ${escapeHtml(step.time_offset_minutes)} min</span> ` : ""}
        ${step.title ? `<strong>${escapeHtml(step.title)}</strong><br />` : ""}
        <span class="recipe-text">${escapeHtml(step.instruction)}</span>
        ${step.why ? `<p class="step-explanation">${escapeHtml(step.why)}</p>` : ""}
      </li>
    `);
    const facts = [recipe.serves ? `Serves ${recipe.serves}` : "",
      recipe.total_time_minutes != null ? `${recipe.total_time_minutes} minutes` : ""].filter(Boolean);
    content.innerHTML = `
      ${imageHtml}
      ${facts.length ? `<p class="recipe-facts">${escapeHtml(facts.join(" · "))}</p>` : ""}
      ${recipe.description ? `<p class="recipe-text">${escapeHtml(recipe.description)}</p>` : ""}
      ${ingredientsHtml}${stepsHtml}
      ${recipe.notes ? `<section class="dish-section"><h3>Recipe notes</h3><p class="recipe-text">${escapeHtml(recipe.notes)}</p></section>` : ""}
    `;
    card.dataset.loaded = "true";
  } catch (error) {
    content.innerHTML = "<p>Could not load recipe. Close and reopen it to try again.</p>";
    console.error(error);
  }
}

function initialiseAccordions() {
  dishList.querySelectorAll(".dish-toggle").forEach(toggle => {
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => {
      const card = toggle.closest(".dish-card");
      const isOpen = card.classList.contains("is-open");
      dishList.querySelectorAll(".dish-card").forEach(other => {
        other.classList.remove("is-open");
        other.querySelector(".dish-toggle").setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        card.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
        if (card.classList.contains("database-dish")) loadDatabaseRecipe(card);
      }
    });
  });
}

function initialiseSearch() {
  dishList.hidden = true;

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    const cards = dishList.querySelectorAll(".dish-card");

if (query.length === 0) {
  cards.forEach(card => {
    card.hidden = false;
  });

  dishCount.textContent =
    `${cards.length} dish${cards.length === 1 ? "" : "es"}`;

  noResults.hidden = true;
  return;
}

    dishList.hidden = false;
    dishCount.hidden = false;

    let visibleCount = 0;

    cards.forEach(card => {
      const title = card.dataset.title?.toLowerCase() || "";
      const ingredients = card.dataset.ingredients?.toLowerCase() || "";
      const tags = card.dataset.tags?.toLowerCase() || "";

      const searchable = `${title} ${ingredients} ${tags}`;
      const matches = searchable.includes(query);

      card.hidden = !matches;

      if (matches) visibleCount++;
    });

    dishCount.textContent =
      `${visibleCount} match${visibleCount === 1 ? "" : "es"}`;

    noResults.hidden = visibleCount !== 0;
  });
}

function updateDishCount() {
  const count = document.querySelectorAll(".dish-card").length;

  dishCount.textContent =
    `${count} dish${count === 1 ? "" : "es"}`;
}

loadDishes();
