import { formatIngredientQuantity } from "./ingredient-quantity.js";
import { requireSession, organisationFetch, organisationImage } from "./session.js";
import { dishFiles } from "./recipe-files.js";
import { getRecipeImagePath } from "./recipe-library.js";

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
    imagePreviewPhoto.src = organisationImage(currentImagePath);
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
      type="text"
      class="ingredient-quantity"
      placeholder="Qty, e.g. 200g"
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

  row.dataset.section = ingredient.section || "";
  for (const [field, value] of Object.entries({ quantity: formatIngredientQuantity(ingredient.quantity),
    name: ingredient.name, notes: ingredient.notes })) {
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
        const response = await organisationFetch(
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


function updateStepControls() {
  const rows = Array.from(stepList.children);
  rows.forEach((row, index) => {
    row.querySelector(".move-step-up").disabled = index === 0;
    row.querySelector(".move-step-down").disabled = index === rows.length - 1;
  });
}

function addStepRow(step = {}) {
  const row = document.createElement("div");
  row.className = "step-row";

  row.innerHTML = `
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

    <div class="step-actions">
    <button type="button" class="move-step move-step-up" aria-label="Move step up" title="Move step up">↑</button>
    <button type="button" class="move-step move-step-down" aria-label="Move step down" title="Move step down">↓</button>
    <button
      type="button"
      class="remove-step"
      aria-label="Remove step"
    >
      ×
    </button>
    </div>
  `;

  // Retain legacy metadata when an existing step is edited or reordered.
  row.dataset.title = step.title ?? "";
  row.dataset.section = step.section ?? "";
  for (const [field, value] of Object.entries({
    instruction: step.instruction, why: step.why })) {
    row.querySelector(`.step-${field}`).value = value ?? "";
  }
  row.querySelectorAll("input, textarea").forEach(input => input.setAttribute("aria-label", input.placeholder));

  row
    .querySelector(".remove-step")
    .addEventListener("click", () => {
      row.remove();
      updateStepControls();
    });

  row.querySelector(".move-step-up").addEventListener("click", () => {
    const previous = row.previousElementSibling;
    if (previous) stepList.insertBefore(row, previous);
    updateStepControls();
  });
  row.querySelector(".move-step-down").addEventListener("click", () => {
    const next = row.nextElementSibling;
    if (next) stepList.insertBefore(next, row);
    updateStepControls();
  });

  stepList.appendChild(row);
  updateStepControls();
}


addIngredientButton.addEventListener("click", () => addIngredientRow());
addStepButton.addEventListener("click", () => addStepRow());


function setDisabled(disabled) {
  for (const control of form.elements) control.disabled = disabled;
  if (!disabled) updateStepControls();
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
    const session = await requireSession();
    if (!session) return;
    if ((requestedSlug || requestedFile) && !session.canEdit) throw new Error("Editor or admin access is required to edit a saved recipe");
    if (session.organisation.type === "professional") {
      const data = await readJson(await organisationFetch("/api/sections"));
      const select = form.elements.namedItem("section_id");
      for (const section of data.sections) {
        const option = document.createElement("option");
        option.value = section.id;
        option.textContent = section.name;
        select.append(option);
      }
      document.getElementById("recipe-section-field").hidden = false;
    }
    let recipe = null;
    if (requestedSlug) {
      recipe = await readJson(await organisationFetch(`/api/recipes/${encodeURIComponent(requestedSlug)}`));
    } else if (requestedFile) {
      if (!dishFiles.includes(requestedFile)) throw new Error("Recipe file not found");
      const saved = await readJson(await organisationFetch(`/api/recipes?source_file=${encodeURIComponent(requestedFile)}`));
      if (saved.recipes.length) {
        recipe = await readJson(await organisationFetch(`/api/recipes/${encodeURIComponent(saved.recipes[0].slug)}`));
      } else {
        throw new Error("This archived recipe is not in the recipe library");
      }
    }
    if (recipe) {
      editingSlug = recipe.slug || null;
      form.elements.namedItem("is_private").checked = Boolean(recipe.is_private);
      if (!recipe.can_manage_privacy) {
        document.querySelector(".privacy-option").hidden = true;
        document.getElementById("recipe-private-hint").hidden = true;
      }
      sourceFile = recipe.source_file || null;
      for (const name of ["name", "description", "yield", "notes", "section_id"]) {
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
        quantity: quantityValue || null,

        name:
          row
            .querySelector(".ingredient-name")
            .value
            .trim(),

        section: row.dataset.section || null,

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
      return {

        title: row.dataset.title || null,

        instruction:
          row
            .querySelector(".step-instruction")
            .value
            .trim(),

        section: row.dataset.section || null,

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
    yield: formData.get("yield"),
    notes: formData.get("notes"),
    section_id: formData.get("section_id") || null,
    is_private: form.elements.namedItem("is_private").checked,
    source_file: sourceFile,
    image_path: currentImagePath,
    remove_image: removeImage,

    ingredients,
    steps
  };


  saving = true;
  setDisabled(true);
  saveButton.textContent = "Saving…";
  try {
    if (!await requireSession()) return;
    const submission = new FormData();
    submission.append("recipe", JSON.stringify(recipe));

    const image = recipeImageInput.files[0];
    if (image) {
      submission.append("image", image);
    }

    const endpoint = editingSlug ? `/api/recipes/${encodeURIComponent(editingSlug)}` : "/api/recipes";
    const response = await organisationFetch(endpoint, {
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

form.addEventListener("input", () => { form.dataset.dirty = "true"; });
