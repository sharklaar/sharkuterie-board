// Recipe style: compact measurement symbols, spaced countable items and words.
const compactUnits = new Set([
  "g", "kg", "mg", "µg", "μg", "ug", "ng",
  "l", "ml", "cl", "dl", "µl", "μl",
  "m", "cm", "mm", "km"
]);
const number = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?[¼½¾⅓⅔⅛⅜⅝⅞]?|[¼½¾⅓⅔⅛⅜⅝⅞])`;
const amountAndUnit = new RegExp(`^(${number}(?:\\s*[-–—]\\s*${number})?)\\s*([\\p{L}]+)(.*)$`, "u");

export function formatIngredientQuantity(value) {
  if (value == null) return null;
  const quantity = String(value).trim();
  if (!quantity) return null;
  const match = quantity.match(amountAndUnit);
  if (!match) return quantity;
  const [, amount, unit, rest] = match;
  // Leave multipliers and prose ranges alone: "2 x 400g", "2 to 3 boxes".
  if (["x", "to"].includes(unit.toLowerCase())) return quantity;
  return `${amount}${compactUnits.has(unit.toLowerCase()) ? "" : " "}${unit}${rest}`;
}
