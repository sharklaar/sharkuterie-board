import { dishFiles } from "./recipe-files.js";
import { parseFileRecipe, getRecipeImagePath } from "./recipe-library.js";

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
let currentImagePath = null;
let removeImage = false;
let editingSlug = null;
let sourceFile = null;
let formReady = false;
let saving = false;
const saveButton = form.querySelector('.save-button');

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


function showCurrentPhoto() {
  clearImagePreview();
  if (currentImagePath) {
    imagePreviewPhoto.src = currentImagePath;
    imageFileName.textContent = "Current recipe photo";
    imagePreview.hidden = false;
  }
}

recipeImageInput.addEventListener("change", () => {
  status.textContent = "";
  const file = recipeImageInput.files[0];
  if (!file) {
    showCurrentPhoto();
    return;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    recipeImageInput.value = "";
    showCurrentPhoto();
    status.textContent = "Photo must be 10 MB or smaller.";
    return;
  }
  clearImagePreview();
  removeImage = false;
  imagePreviewUrl = URL.createObjectURL(file);
  imagePreviewPhoto.src = imagePreviewUrl;
  imageFileName.textContent = file.name;
  imagePreview.hidden = false;
});

removeImageButton.addEventListener("click", () => {
  recipeImageInput.value = "";
  currentImagePath = null;
  removeImage = true;
  clearImagePreview();
});


function addIngredientRow(ingredient = {}) {
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

  const sectionInput = document.createElement("input");
  sectionInput.type = "text";
  sectionInput.className = "ingredient-section";
  sectionInput.placeholder = "Ingredient group (optional), e.g. cheese sauce";
  row.appendChild(sectionInput);
  for (const [field, value] of Object.entries({ quantity: ingredient.quantity, unit: ingredient.unit,
    name: ingredient.name, notes: ingredient.notes, section: ingredient.section })) {
    row.querySelector(`.ingredient-${field}`).value = value ?? "";
  }
  row.querySelectorAll("input").forEach(input => {
    if (!input.hasAttribute("aria-label")) input.setAttribute("aria-label", input.placeholder);
  });

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
      clearTimeout(suggestionTimer);
      suggestionRequest?.abort();
      row.remove();
    });

  ingredientList.appendChild(row);
}


function addStepRow(step = {}) {
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

  const sectionInput = document.createElement("input");
  sectionInput.type = "text";
  sectionInput.className = "step-section";
  sectionInput.placeholder = "Method section (optional), e.g. prep or plating";
  row.appendChild(sectionInput);
  for (const [field, value] of Object.entries({ time: step.time_offset_minutes, title: step.title,
    instruction: step.instruction, why: step.why, section: step.section })) {
    row.querySelector(`.step-${field}`).value = value ?? "";
  }
  row.querySelectorAll("input, textarea").forEach(input => input.setAttribute("aria-label", input.placeholder));

  row
    .querySelector(".remove-step")
    .addEventListener("click", () => {
      row.remove();
    });

  stepList.appendChild(row);
}


addIngredientButton.addEventListener("click", () => addIngredientRow());
addStepButton.addEventListener("click", () => addStepRow());


function setDisabled(disabled) {
  for (const control of form.elements) control.disabled = disabled;
  form.setAttribute("aria-busy", String(disabled));
}

async function readJson(response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Recipe could not be loaded");
  return result;
}

async function initialiseEditor() {
  const params = new URLSearchParams(window.location.search);
  const requestedSlug = params.get("recipe");
  const requestedFile = params.get("source");
  if (requestedSlug || requestedFile) {
    document.title = "Edit Recipe | Kitchen Ops";
    document.querySelector(".recipe-page-header h1").textContent = "Edit a recipe";
    document.querySelector(".recipe-intro").textContent = "Update the ingredients, method and notes for this recipe.";
    saveButton.textContent = "Save changes";
  }
  setDisabled(true);
  status.textContent = requestedSlug || requestedFile ? "Loading recipe…" : "";
  try {
    let recipe = null;
    if (requestedSlug) {
      recipe = await readJson(await fetch(`/api/recipes/${encodeURIComponent(requestedSlug)}`));
    } else if (requestedFile) {
      if (!dishFiles.includes(requestedFile)) throw new Error("Recipe file not found");
      const saved = await readJson(await fetch(`/api/recipes?source_file=${encodeURIComponent(requestedFile)}`));
      if (saved.recipes.length) {
        recipe = await readJson(await fetch(`/api/recipes/${encodeURIComponent(saved.recipes[0].slug)}`));
      } else {
        const response = await fetch(`/${requestedFile}`);
        if (!response.ok) throw new Error("Recipe file could not be loaded");
        recipe = parseFileRecipe(await response.text(), requestedFile);
      }
    }
    if (recipe) {
      editingSlug = recipe.slug || null;
      sourceFile = recipe.source_file || null;
      for (const name of ["name", "description", "serves", "total_time_minutes", "tags", "notes"]) {
        form.elements.namedItem(name).value = recipe[name] ?? "";
      }
      (recipe.ingredients.length ? recipe.ingredients : [{}]).forEach(addIngredientRow);
      (recipe.steps.length ? recipe.steps : [{}]).forEach(addStepRow);
      currentImagePath = getRecipeImagePath(recipe.image_path);
      showCurrentPhoto();
    } else {
      addIngredientRow();
      addStepRow();
    }
    formReady = true;
    setDisabled(false);
    status.textContent = "";
  } catch (error) {
    status.textContent = `${error.message}. Refresh to try again or return to the recipe board.`;
  }
}

initialiseEditor();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!formReady || saving) return;

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

        section: row.querySelector(".ingredient-section").value.trim() || null,

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

        section: row.querySelector(".step-section").value.trim() || null,

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
    tags: formData.get("tags"),
    notes: formData.get("notes"),
    source_file: sourceFile,
    image_path: currentImagePath,
    remove_image: removeImage,

    total_time_minutes:
      totalTime === ""
        ? null
        : Number(totalTime),

    ingredients,
    steps
  };


  saving = true;
  setDisabled(true);
  saveButton.textContent = "Saving…";
  try {
    const submission = new FormData();
    submission.append("recipe", JSON.stringify(recipe));

    const image = recipeImageInput.files[0];
    if (image) {
      submission.append("image", image);
    }

    const endpoint = editingSlug ? `/api/recipes/${encodeURIComponent(editingSlug)}` : "/api/recipes";
    const response = await fetch(endpoint, {
      method: editingSlug ? "PUT" : "POST",
      body: submission
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || "Could not save recipe"
      );
    }

    window.location.href = `/?recipe=${encodeURIComponent(result.slug)}`;

  } catch (error) {
    console.error(error);
    status.textContent = error.message;
    saving = false;
    setDisabled(false);
    saveButton.textContent = editingSlug || sourceFile ? "Save changes" : "Save recipe";
  }
});
