const form = document.getElementById("recipe-form");
const status = document.getElementById("form-status");

const ingredientList = document.getElementById("ingredient-list");
const addIngredientButton = document.getElementById("add-ingredient");

const stepList = document.getElementById("step-list");
const addStepButton = document.getElementById("add-step");


function addIngredientRow() {
  const row = document.createElement("div");
  row.className = "ingredient-row";

  row.innerHTML = `
    <input
      type="number"
      class="ingredient-quantity"
      placeholder="Qty"
      step="any"
      min="0"
    />

    <input
      type="text"
      class="ingredient-unit"
      placeholder="Unit"
    />

    <input
      type="text"
      class="ingredient-name"
      placeholder="Ingredient"
    />

    <input
      type="text"
      class="ingredient-notes"
      placeholder="Notes"
    />

    <button
      type="button"
      class="remove-ingredient"
      aria-label="Remove ingredient"
    >
      ×
    </button>
  `;

  row
    .querySelector(".remove-ingredient")
    .addEventListener("click", () => {
      row.remove();
    });

  ingredientList.appendChild(row);
}


function addStepRow() {
  const row = document.createElement("div");
  row.className = "step-row";

  row.innerHTML = `
    <input
      type="number"
      class="step-time"
      placeholder="T+ mins"
      min="0"
    />

    <input
      type="text"
      class="step-title"
      placeholder="Step title"
    />

    <textarea
      class="step-instruction"
      placeholder="Instruction"
      rows="3"
    ></textarea>

    <textarea
      class="step-why"
      placeholder="Why? (optional)"
      rows="2"
    ></textarea>

    <button
      type="button"
      class="remove-step"
      aria-label="Remove step"
    >
      ×
    </button>
  `;

  row
    .querySelector(".remove-step")
    .addEventListener("click", () => {
      row.remove();
    });

  stepList.appendChild(row);
}


addIngredientButton.addEventListener("click", addIngredientRow);
addStepButton.addEventListener("click", addStepRow);


// Start with one empty ingredient and one empty step
addIngredientRow();
addStepRow();


form.addEventListener("submit", async (event) => {
  event.preventDefault();

  status.textContent = "Saving...";

  const formData = new FormData(form);

  const heatLevel = formData.get("heat_level");
  const totalTime = formData.get("total_time_minutes");


  // Ingredients
  const ingredients = Array.from(
    document.querySelectorAll(".ingredient-row")
  )
    .map(row => {
      const quantityValue = row
        .querySelector(".ingredient-quantity")
        .value
        .trim();

      return {
        quantity:
          quantityValue === ""
            ? null
            : Number(quantityValue),

        unit:
          row
            .querySelector(".ingredient-unit")
            .value
            .trim() || null,

        name:
          row
            .querySelector(".ingredient-name")
            .value
            .trim(),

        notes:
          row
            .querySelector(".ingredient-notes")
            .value
            .trim() || null
      };
    })
    .filter(ingredient => ingredient.name !== "");


  // Method steps
  const steps = Array.from(
    document.querySelectorAll(".step-row")
  )
    .map(row => {
      const timeValue = row
        .querySelector(".step-time")
        .value
        .trim();

      return {
        time_offset_minutes:
          timeValue === ""
            ? null
            : Number(timeValue),

        title:
          row
            .querySelector(".step-title")
            .value
            .trim() || null,

        instruction:
          row
            .querySelector(".step-instruction")
            .value
            .trim(),

        why:
          row
            .querySelector(".step-why")
            .value
            .trim() || null
      };
    })
    .filter(step => step.instruction !== "");


  const recipe = {
    name: formData.get("name"),
    description: formData.get("description"),
    serves: formData.get("serves"),

    heat_level:
      heatLevel === ""
        ? null
        : Number(heatLevel),

    total_time_minutes:
      totalTime === ""
        ? null
        : Number(totalTime),

    ingredients,
    steps
  };


  try {
    const response = await fetch("/api/recipes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(recipe)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || "Could not save recipe"
      );
    }

    window.location.href = "/";

  } catch (error) {
    console.error(error);
    status.textContent = error.message;
  }
});