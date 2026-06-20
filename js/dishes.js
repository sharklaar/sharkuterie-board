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
"dishes/asparagus-soup.html"
];

const dishList = document.getElementById("dish-list");
const searchInput = document.getElementById("dish-search");
const dishCount = document.getElementById("dish-count");
const noResults = document.getElementById("no-results");

async function loadDishes() {
  const responses = await Promise.all(
    dishFiles.map(file => fetch(file).then(res => res.text()))
  );

  dishList.innerHTML = responses.join("\n");

  initialiseAccordions();
  initialiseSearch();
  updateDishCount();
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