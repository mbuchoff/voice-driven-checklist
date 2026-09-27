-- Frozen from origin/main 178323c by executing its migrations in real SQLite.
-- Kept independent of current migrations so upgrade tests detect schema drift.
PRAGMA foreign_keys = ON;

CREATE TABLE account_preferences (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  mode TEXT NOT NULL CHECK (mode IN ('unselected', 'local', 'google')),
  cognito_sub TEXT,
  display_name TEXT,
  email TEXT,
  CHECK (
    (mode = 'google' AND cognito_sub IS NOT NULL)
    OR
    (
      mode IN ('unselected', 'local')
      AND cognito_sub IS NULL
      AND display_name IS NULL
      AND email IS NULL
    )
  )
);

CREATE TABLE checklist_items (
  id TEXT PRIMARY KEY NOT NULL,
  checklist_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
);

CREATE TABLE checklists (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE device_preferences (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  theme TEXT NOT NULL CHECK (theme IN ('system', 'light', 'dark')),
  sound TEXT NOT NULL CHECK (sound IN ('chime', 'wood', 'ping', 'quiet'))
);

CREATE UNIQUE INDEX checklist_items_unique_position
  ON checklist_items (checklist_id, position);

PRAGMA user_version = 2;
