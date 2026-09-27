const dishFiles = [

  //"dishes/spinach-ricotta-arancini.html",
  "dishes/risotto-base.html",
  "dishes/pea-soup.html",
  "dishes/salmon-ceviche.html",
  "dishes/green-oil.html",
  "dishes/mackerel-pate.html",
  "dishes/chimichurri.html",
  "dishes/pan-tumaca.html",
  "dishes/tempura-courgette.html",
  "dishes/bbq-sauce.html",
  "dishes/hummus.html",
  "dishes/crispy-chilli-oil.html",
  "dishes/scallops.html",
  "dishes/chicken-liver-parfait.html",
  "dishes/asparagus-starter.html",
  "dishes/trio-of-nibbles.html",
  "dishes/salsa-verde.html",
  "dishes/toastie-mix.html",
  "dishes/wild-garlic-pesto.html",
  "dishes/rockefeller.html",
"dishes/parsley-sauce.html",
"dishes/parsley-and-artichoke-salad.html",
"dishes/pickled-endive.html",
"dishes/parsley-salad.html",
"dishes/parmesan-beignets.html",
"dishes/parmesan-biscuits.html",
"dishes/pickled-vegetable-relish.html",
"dishes/onion-confit.html",
"dishes/onions-monegasque.html",
"dishes/nicoise.html",
"dishes/mustard-dressing.html",
"dishes/mushrooms-a-la-grecque.html",
"dishes/marinated-courgettes.html",
"dishes/marinated-baby-artichokes.html",
"dishes/messine-sauce.html",
"dishes/lobster-stock.html",
"dishes/lime-ginger-and-coriander-butter.html",
"dishes/lemon-and-basil-risotto.html",
"dishes/mayonnaise.html",
"dishes/asparagus-soup.html",
"dishes/katsu-curry.html",
"dishes/chicken-pie.html",
"dishes/lime-pickle.html",
"dishes/achari.html"
];

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
  // Existing static dishes
  const responses = await Promise.all(
    dishFiles.map(file => fetch(file).then(res => res.text()))
  );

  // New database-backed dishes
  const apiResponse = await fetch("/api/recipes");
  const data = await apiResponse.json();

const databaseDishes = data.recipes.map(recipe => `
  <article
    class="dish-card database-dish"
    data-title="${escapeHtml(recipe.name)}"
    data-ingredients=""
    data-tags=""
    data-slug="${escapeHtml(recipe.slug)}"
  >
    <button class="dish-toggle" type="button">
      <span>
        <strong>${escapeHtml(recipe.name)}</strong><br />
        <span class="dish-meta">Database recipe</span>
      </span>
    </button>

    <div class="dish-content">
      <div class="database-recipe-content">
        <p>Loading...</p>
      </div>
    </div>
  </article>
`);

  dishList.innerHTML =
    responses.join("\n") +
    databaseDishes.join("\n");

  initialiseAccordions();
  initialiseSearch();
  updateDishCount();
}

async function loadDatabaseRecipe(card) {
  if (card.dataset.loaded === "true") {
    return;
  }

  const slug = card.dataset.slug;
  const content = card.querySelector(".database-recipe-content");

  try {
    const response = await fetch(`/api/recipes/${slug}`);

    if (!response.ok) {
      throw new Error("Recipe could not be loaded");
    }

    const recipe = await response.json();

    const ingredientsHtml = recipe.ingredients
      .map(ingredient => {
        const quantity = ingredient.quantity ?? "";
        const unit = ingredient.unit ?? "";
        const notes = ingredient.notes
          ? ` — ${escapeHtml(ingredient.notes)}`
          : "";

        return `
          <li>
            ${quantity} ${escapeHtml(unit)}
            ${escapeHtml(ingredient.name)}
            ${notes}
          </li>
        `;
      })
      .join("");

    const stepsHtml = recipe.steps
      .map(step => `
        <li>
          ${step.title
            ? `<strong>${escapeHtml(step.title)}</strong><br />`
            : ""
          }
          ${escapeHtml(step.instruction)}
        </li>
      `)
      .join("");

    content.innerHTML = `
      <section class="dish-section">
        <h3>Ingredients</h3>
        <ul>
          ${ingredientsHtml}
        </ul>
      </section>

      <section class="dish-section">
        <h3>Method</h3>
        <ol>
          ${stepsHtml}
        </ol>
      </section>
    `;

    card.dataset.loaded = "true";

  } catch (error) {
    content.innerHTML = `
      <p>Could not load recipe.</p>
    `;
    console.error(error);
  }
}

function initialiseAccordions() {
  const toggles = document.querySelectorAll(".dish-toggle");

  toggles.forEach(toggle => {
    toggle.addEventListener("click", () => {
      const card = toggle.closest(".dish-card");
      const isOpen = card.classList.contains("is-open");

      document.querySelectorAll(".dish-card").forEach(c => {
        c.classList.remove("is-open");
      });

    if (!isOpen) {
  card.classList.add("is-open");

  if (card.classList.contains("database-dish")) {
    loadDatabaseRecipe(card);
  }
}
    });
  });
}

function initialiseSearch() {
  dishList.hidden = true;

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    const cards = document.querySelectorAll(".dish-card");

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