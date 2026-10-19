CREATE TABLE recipe_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'edited')),
  person_id TEXT,
  actor_email TEXT,
  actor_name TEXT,
  actor_position TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX recipe_activity_recipe ON recipe_activity(recipe_id, occurred_at, id);

INSERT INTO recipe_activity (recipe_id, action, occurred_at)
SELECT id, 'created', created_at FROM recipes;
