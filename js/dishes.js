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

  document.querySelectorAll(".dish-card").forEach(card => {
  card.hidden = true;
});

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

    if (query.length < 3) {
      dishList.hidden = true;
      noResults.hidden = true;
      dishCount.hidden = true;

      cards.forEach(card => {
        card.hidden = true;
        card.classList.remove("is-open");
      });

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