CREATE TABLE organisation_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  email TEXT,
  admin INTEGER NOT NULL DEFAULT 0 CHECK(admin IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1))
);
CREATE UNIQUE INDEX organisation_email ON organisation_users(lower(email)) WHERE email IS NOT NULL AND active = 1;
INSERT INTO organisation_users (id, name, position, email, admin) VALUES ('marc-daffern', 'Marc Daffern', 'Commis', 'marc@blackhawkwdown.org.uk', 1);
INSERT INTO organisation_users (id, name, position, email, admin) VALUES ('liam-goodwill', 'Liam Goodwill', 'Exec Chef', 'liam@woodford.group', 1);
INSERT INTO organisation_users (id, name, position, email, admin) VALUES ('kieran-flynn', 'Kieran Flynn', 'Head Chef', NULL, 0);
INSERT INTO organisation_users (id, name, position, email, admin) VALUES ('alex-biggs', 'Alex Biggs', 'Sous Chef', 'alex_biggs@hotmail.com', 0);
INSERT INTO organisation_users (id, name, position, email, admin) VALUES ('ryan-cox', 'Ryan Cox', 'Junior Sous', NULL, 0);
INSERT INTO organisation_users (id, name, position, email, admin) VALUES ('kane-williams', 'Kane Williams', 'Chef De Partie', NULL, 0);
INSERT INTO organisation_users (id, name, position, email, admin) VALUES ('sarah-laughton', 'Sarah Laughton', 'Breakfast', NULL, 0);
