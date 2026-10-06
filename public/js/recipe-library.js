import { dishFiles } from "./recipe-files.js";

export function getRecipeImagePath(path) {
  if (typeof path !== "string") return null;
  return /^\/(?:media\/recipe-images\/[a-f0-9-]+|images\/[a-z0-9_-]+)\.(?:jpe?g|png|webp|avif)$/i.test(path)
    ? path
    : null;
}

function text(element) {
  const copy = element.cloneNode(true);
  copy.querySelectorAll("br").forEach(br => br.replaceWith("\u0000"));
  return copy.textContent.replace(/\s+/g, " ").replace(/\u0000/g, "\n").trim();
}

function parseIngredient(value, section) {
  // Only split clear quantities. Ranges and fractions stay intact for review.
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(?:(kg|g|ml|l|litres?|liters?|pints?|tsp|ktsp|tbsp|teaspoons?|tablespoons?|cloves?)\b\s*|\s+)(.+)$/i);
  const ingredient = { quantity: null, unit: null, name: value, notes: null, section };
  if (match && !/^(?:[–\-\/]|\d+\s*\/)/.test(match[3])) {
    ingredient.quantity = Number(match[1]);
    ingredient.unit = match[2] || null;
    ingredient.name = match[3];
  }
  return ingredient;
}

export function parseFileRecipe(html, sourceFile) {
  if (!dishFiles.includes(sourceFile)) throw new Error("Recipe file not found");
  const document = new DOMParser().parseFromString(html, "text/html");
  const card = document.querySelector(".dish-card");
  if (!card) throw new Error("Recipe file could not be read");

  const recipe = {
    name: card.dataset.title || text(card.querySelector(".dish-toggle strong")),
    description: text(card.querySelector(".dish-meta") || document.createElement("span")),
    serves: null,
    total_time_minutes: null,
    source_file: sourceFile,
    tags: card.dataset.tags || "",
    notes: "",
    image_path: null,
    ingredients: [],
    steps: []
  };
  const image = card.querySelector(".dish-content img");
  if (image) {
    recipe.image_path = getRecipeImagePath(new URL(image.getAttribute("src"), "https://recipe.invalid/").pathname);
  }

  const notes = [];
  function addNote(title, value) {
    const last = notes[notes.length - 1];
    if (last?.title === title) last.values.push(value);
    else notes.push({ title, values: [value] });
  }
  const sections = card.querySelectorAll(".dish-section");
  for (const section of sections) {
    let heading = "";
    let subheading = "";
    for (const block of section.children) {
      if (block.tagName === "H3") {
        heading = text(block);
        subheading = "";
        continue;
      }
      if (block.tagName === "H4") {
        subheading = text(block);
        continue;
      }
      const title = [heading, subheading].filter(Boolean).join(" · ");
      const noteSection = /notes?|timing|cues|concept|fixes/i.test(subheading || heading);
      const methodSection = /method|prep|cook|plate|instructions?|assembly|finish/i.test(subheading || heading);
      if (block.tagName === "UL" || block.tagName === "OL") {
        for (const item of block.children) {
          if (item.tagName !== "LI") continue;
          const value = text(item);
          if (!value) continue;
          if (noteSection) {
            addNote(title, `• ${value}`);
          } else if (block.tagName === "OL" || methodSection) {
            recipe.steps.push({ instruction: value, section: title, title: null, why: null, time_offset_minutes: null });
          } else {
            recipe.ingredients.push(parseIngredient(value, title === "Ingredients" ? null : title));
          }
        }
      } else if (text(block)) {
        if (!noteSection && (methodSection || section.querySelector("ol") || section.querySelector("ul"))) {
          recipe.steps.push({ instruction: text(block), section: title, title: null, why: null, time_offset_minutes: null });
        } else {
          addNote(title, text(block));
        }
      }
    }
  }
  recipe.notes = notes.map(note => [note.title, note.values.join("\n")].filter(Boolean).join("\n")).join("\n\n");
  return recipe;
}
