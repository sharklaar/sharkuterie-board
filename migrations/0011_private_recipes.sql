ALTER TABLE recipes ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1));
ALTER TABLE recipes ADD COLUMN creator_id TEXT;
UPDATE recipes SET creator_id = (SELECT person_id FROM recipe_activity WHERE recipe_id = recipes.id AND action = 'created' ORDER BY id LIMIT 1);
