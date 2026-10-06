import { getRecipeImagePath } from "./recipe-library.js";

const dishList = document.getElementById("dish-list");
const searchInput = document.getElementById("dish-search");
const dishCount = document.getElementById("dish-count");
const noResults = document.getElementById("no-results");
const libraryStatus = document.getElementById("recipe-library-status");
const deleteDialog = document.getElementById("delete-recipe-dialog");
const deleteForm = document.getElementById("delete-recipe-form");
const deleteName = document.getElementById("delete-recipe-name");
const deleteError = document.getElementById("delete-recipe-error");
const cancelDelete = document.getElementById("cancel-recipe-delete");
const confirmDelete = document.getElementById("confirm-recipe-delete");
let recipeToDelete = null;
let deleting = false;

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
            <button class="recipe-delete-button" type="button"
              aria-label="Delete ${escapeHtml(recipe.name)}">Delete recipe</button>
          </div>
          <div class="database-recipe-content"><p>Loading…</p></div>
        </div>
      </article>
    `);
    dishList.innerHTML = databaseDishes.join("\n");
    initialiseAccordions();
    initialiseSearch();

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
  searchInput.addEventListener("input", filterDishes);
  filterDishes();
}

function filterDishes() {
  const query = searchInput.value.trim().toLowerCase();
  const cards = dishList.querySelectorAll(".dish-card");
  if (query) {
    dishList.hidden = false;
    dishCount.hidden = false;
  }
  let visibleCount = 0;
  cards.forEach(card => {
    const searchable = [card.dataset.title, card.dataset.ingredients, card.dataset.tags]
      .join(" ").toLowerCase();
    const matches = !query || searchable.includes(query);
    card.hidden = !matches;
    if (matches) visibleCount++;
  });
  dishCount.textContent = query
    ? `${visibleCount} match${visibleCount === 1 ? "" : "es"}`
    : `${cards.length} dish${cards.length === 1 ? "" : "es"}`;
  noResults.textContent = cards.length
    ? "No matching dishes found."
    : "No recipes yet. Add a recipe to get started.";
  noResults.hidden = visibleCount !== 0;
}

function setDeleting(value) {
  deleting = value;
  confirmDelete.disabled = value;
  cancelDelete.disabled = value;
  confirmDelete.textContent = value ? "Deleting…" : "Delete recipe";
  deleteForm.setAttribute("aria-busy", String(value));
}

dishList.addEventListener("click", event => {
  const button = event.target.closest(".recipe-delete-button");
  if (!button || deleteDialog.open) return;
  recipeToDelete = button.closest(".dish-card");
  deleteName.textContent = recipeToDelete.dataset.title;
  deleteError.textContent = "";
  deleteError.hidden = true;
  setDeleting(false);
  deleteDialog.showModal();
});

cancelDelete.addEventListener("click", () => {
  if (!deleting) deleteDialog.close();
});
deleteDialog.addEventListener("cancel", event => {
  if (deleting) event.preventDefault();
});
deleteDialog.addEventListener("close", () => { recipeToDelete = null; });

deleteForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!recipeToDelete || deleting) return;
  const card = recipeToDelete;
  const { slug, title } = card.dataset;
  deleteError.hidden = true;
  setDeleting(true);
  try {
    const response = await fetch(`/api/recipes/${encodeURIComponent(slug)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not delete recipe. Please try again.");
    card.remove();
    filterDishes();
    const url = new URL(window.location.href);
    if (url.searchParams.get("recipe") === slug) {
      url.searchParams.delete("recipe");
      window.history.replaceState(null, "", url);
    }
    libraryStatus.textContent = `“${title}” was deleted.`;
    libraryStatus.hidden = false;
    deleteDialog.close();
    searchInput.focus();
  } catch (error) {
    console.error(error);
    deleteError.textContent = error.message;
    deleteError.hidden = false;
  } finally {
    setDeleting(false);
  }
});

loadDishes();
