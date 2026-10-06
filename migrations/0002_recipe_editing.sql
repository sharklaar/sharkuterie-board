ALTER TABLE recipes ADD COLUMN source_file TEXT;
ALTER TABLE recipes ADD COLUMN notes TEXT;
ALTER TABLE recipes ADD COLUMN tags TEXT;
ALTER TABLE ingredients ADD COLUMN section TEXT;
ALTER TABLE steps ADD COLUMN section TEXT;

CREATE UNIQUE INDEX recipes_source_file_unique
  ON recipes(source_file)
  WHERE source_file IS NOT NULL;
