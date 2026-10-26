CREATE TABLE organisations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
INSERT INTO organisations (id, name) VALUES ('william-cecil', 'William Cecil');
INSERT INTO organisations (id, name) VALUES ('daffern-family', 'Daffern Family');

CREATE TABLE organisation_memberships (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  email TEXT,
  admin INTEGER NOT NULL DEFAULT 0 CHECK(admin IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  organisation_id TEXT NOT NULL DEFAULT 'william-cecil' REFERENCES organisations(id),
  access TEXT NOT NULL DEFAULT 'member' CHECK(access IN ('member', 'editor', 'admin')),
  CHECK(admin = (access = 'admin'))
);
INSERT INTO organisation_memberships (id, name, position, email, admin, active, organisation_id, access)
SELECT id, name, position, email, admin, active, 'william-cecil', CASE WHEN admin = 1 THEN 'admin' ELSE 'member' END FROM organisation_users;
DROP TABLE organisation_users;
ALTER TABLE organisation_memberships RENAME TO organisation_users;
CREATE UNIQUE INDEX organisation_email ON organisation_users(organisation_id, lower(email)) WHERE email IS NOT NULL AND active = 1;
CREATE INDEX organisation_memberships ON organisation_users(lower(email), active);
INSERT INTO organisation_users (id, name, position, email, admin, access, organisation_id) VALUES ('daffern-family-marc', 'Marc Daffern', 'Chef', 'marc@blackhawkdown.org.uk', 1, 'admin', 'daffern-family');
INSERT INTO organisation_users (id, name, position, email, admin, access, organisation_id) VALUES ('daffern-family-toby', 'Toby Daffern', 'Mush', 'toby.daffern@outlook.com', 0, 'member', 'daffern-family');
INSERT INTO organisation_users (id, name, position, email, admin, access, organisation_id) VALUES ('daffern-family-william', 'William Daffern', 'Mush', 'williamdaffern@outlook.com', 0, 'member', 'daffern-family');

CREATE TABLE recipes_with_organisation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  serves TEXT,
  heat_level REAL,
  total_time_minutes INTEGER,
  image_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_file TEXT,
  notes TEXT,
  tags TEXT,
  yield TEXT,
  organisation_id TEXT NOT NULL DEFAULT 'william-cecil' REFERENCES organisations(id)
);
INSERT INTO recipes_with_organisation (id, name, slug, description, serves, heat_level, total_time_minutes,
  image_path, created_at, updated_at, source_file, notes, tags, yield, organisation_id)
SELECT id, name, slug, description, serves, heat_level, total_time_minutes,
  image_path, created_at, updated_at, source_file, notes, tags, yield, 'william-cecil' FROM recipes;

CREATE TABLE ingredients_with_organisation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes_with_organisation(id) ON DELETE CASCADE,
  quantity TEXT,
  unit TEXT,
  name TEXT NOT NULL,
  notes TEXT,
  sort_order INTEGER NOT NULL,
  section TEXT
);
INSERT INTO ingredients_with_organisation SELECT id, recipe_id, quantity, unit, name, notes, sort_order, section FROM ingredients;
CREATE TABLE steps_with_organisation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes_with_organisation(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  time_offset_minutes INTEGER,
  title TEXT,
  instruction TEXT NOT NULL,
  why TEXT,
  section TEXT
);
INSERT INTO steps_with_organisation SELECT id, recipe_id, sort_order, time_offset_minutes, title, instruction, why, section FROM steps;
CREATE TABLE activity_with_organisation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes_with_organisation(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('created', 'edited')),
  person_id TEXT,
  actor_email TEXT,
  actor_name TEXT,
  actor_position TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO activity_with_organisation SELECT id, recipe_id, action, person_id, actor_email, actor_name, actor_position, occurred_at FROM recipe_activity;

DROP TABLE recipe_activity;
DROP TABLE ingredients;
DROP TABLE steps;
DROP TABLE recipes;
ALTER TABLE recipes_with_organisation RENAME TO recipes;
ALTER TABLE ingredients_with_organisation RENAME TO ingredients;
ALTER TABLE steps_with_organisation RENAME TO steps;
ALTER TABLE activity_with_organisation RENAME TO recipe_activity;
CREATE INDEX recipe_activity_recipe ON recipe_activity(recipe_id, occurred_at, id);
CREATE INDEX recipes_organisation ON recipes(organisation_id, name);
CREATE UNIQUE INDEX recipes_source_file_unique ON recipes(organisation_id, source_file) WHERE source_file IS NOT NULL;
