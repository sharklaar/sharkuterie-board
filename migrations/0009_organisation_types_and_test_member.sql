ALTER TABLE organisations ADD COLUMN type TEXT NOT NULL DEFAULT 'professional' CHECK(type IN ('lite', 'professional'));
UPDATE organisations SET type = 'lite' WHERE id = 'daffern-family';
INSERT INTO organisation_users (id, name, position, email, admin, access, organisation_id)
VALUES ('daffern-family-marc-test', 'Marc', 'Chef', 'marcdaffern@hotmail.com', 0, 'member', 'daffern-family');
