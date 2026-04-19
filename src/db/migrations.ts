import type { Database } from './database';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS checklists (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id TEXT PRIMARY KEY NOT NULL,
  checklist_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS checklist_items_unique_position
  ON checklist_items (checklist_id, position);
`;

export async function runMigrations(db: Database): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(SCHEMA_SQL);
}
