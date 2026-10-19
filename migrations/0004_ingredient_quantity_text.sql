CREATE TABLE ingredients_with_text_quantity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL,
  quantity TEXT,
  unit TEXT,
  name TEXT NOT NULL,
  notes TEXT,
  sort_order INTEGER NOT NULL,
  section TEXT,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

INSERT INTO ingredients_with_text_quantity (id, recipe_id, quantity, unit, name, notes, sort_order, section)
SELECT id, recipe_id,
  NULLIF(COALESCE(CASE WHEN quantity = CAST(quantity AS INTEGER)
    THEN CAST(CAST(quantity AS INTEGER) AS TEXT)
    ELSE CAST(quantity AS TEXT) END, '') || COALESCE(TRIM(unit), ''), ''),
  NULL, name, notes, sort_order, section
FROM ingredients;

DROP TABLE ingredients;
ALTER TABLE ingredients_with_text_quantity RENAME TO ingredients;
