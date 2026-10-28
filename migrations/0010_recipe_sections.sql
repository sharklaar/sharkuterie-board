CREATE TABLE recipe_sections (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80)
);
CREATE UNIQUE INDEX recipe_sections_name ON recipe_sections(organisation_id, name COLLATE NOCASE);
ALTER TABLE recipes ADD COLUMN section_id TEXT REFERENCES recipe_sections(id) ON DELETE SET NULL;
CREATE INDEX recipes_section ON recipes(organisation_id, section_id);
INSERT INTO recipe_sections (id, organisation_id, name) VALUES ('william-cecil-larder', 'william-cecil', 'Larder');
INSERT INTO recipe_sections (id, organisation_id, name) VALUES ('william-cecil-sauce', 'william-cecil', 'Sauce');
INSERT INTO recipe_sections (id, organisation_id, name) VALUES ('william-cecil-pastry', 'william-cecil', 'Pastry');
INSERT INTO recipe_sections (id, organisation_id, name) VALUES ('william-cecil-shared', 'william-cecil', 'Shared');
UPDATE recipes SET section_id = 'william-cecil-larder' WHERE organisation_id = 'william-cecil';
