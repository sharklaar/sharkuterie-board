const form = document.getElementById("recipe-form");
const status = document.getElementById("form-status");

const ingredientList = document.getElementById("ingredient-list");
const addIngredientButton = document.getElementById("add-ingredient");

const stepList = document.getElementById("step-list");
const addStepButton = document.getElementById("add-step");
const recipeImageInput = document.getElementById("recipe-image");
const imagePreview = document.getElementById("image-preview");
const imagePreviewPhoto = document.getElementById("image-preview-photo");
const imageFileName = document.getElementById("image-file-name");
const removeImageButton = document.getElementById("remove-image");

let ingredientRowCount = 0;
let imagePreviewUrl = null;

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;


function clearImagePreview() {
  if (imagePreviewUrl) {
    URL.revokeObjectURL(imagePreviewUrl);
    imagePreviewUrl = null;
  }

  imagePreviewPhoto.removeAttribute("src");
  imageFileName.textContent = "";
  imagePreview.hidden = true;
}


recipeImageInput.addEventListener("change", () => {
  status.textContent = "";
  clearImagePreview();

  const file = recipeImageInput.files[0];
  if (!file) {
    return;
  }

  if (file.size > MAX_IMAGE_SIZE) {
    recipeImageInput.value = "";
    status.textContent = "Photo must be 10 MB or smaller.";
    return;
  }

  imagePreviewUrl = URL.createObjectURL(file);
  imagePreviewPhoto.src = imagePreviewUrl;
  imageFileName.textContent = file.name;
  imagePreview.hidden = false;
});

removeImageButton.addEventListener("click", () => {
  recipeImageInput.value = "";
  clearImagePreview();
});


function addIngredientRow() {
  const suggestionsId = `ingredient-suggestions-${++ingredientRowCount}`;
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

    <div class="ingredient-name-field">
      <input
        type="text"
        class="ingredient-name"
        placeholder="Ingredient"
        aria-label="Ingredient name"
        list="${suggestionsId}"
        autocomplete="off"
      />
      <datalist id="${suggestionsId}"></datalist>
    </div>

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

  const ingredientName = row.querySelector(".ingredient-name");
  const suggestions = row.querySelector("datalist");
  let suggestionTimer;
  let suggestionRequest;

  ingredientName.addEventListener("input", () => {
    clearTimeout(suggestionTimer);
    suggestionRequest?.abort();

    const query = ingredientName.value.trim();
    if (query.length < 2) {
      suggestions.replaceChildren();
      return;
    }

    suggestionTimer = setTimeout(async () => {
      const controller = new AbortController();
      suggestionRequest = controller;

      try {
        const response = await fetch(
          `/api/ingredients?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("Ingredient suggestions could not be loaded");
        }

        const result = await response.json();
        if (ingredientName.value.trim() !== query) {
          return;
        }

        suggestions.replaceChildren(
          ...result.ingredients.map(name => {
            const option = document.createElement("option");
            option.value = name;
            return option;
          })
        );
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error(error);
        }
      }
    }, 180);
  });

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

  status.textContent = "Saving recipe...";

  const formData = new FormData(form);

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

    total_time_minutes:
      totalTime === ""
        ? null
        : Number(totalTime),

    ingredients,
    steps
  };


  try {
    const submission = new FormData();
    submission.append("recipe", JSON.stringify(recipe));

    const image = recipeImageInput.files[0];
    if (image) {
      submission.append("image", image);
    }

    const response = await fetch("/api/recipes", {
      method: "POST",
      body: submission
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
