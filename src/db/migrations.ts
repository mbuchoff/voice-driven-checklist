import type { Database } from './database';

const CHECKLIST_SCHEMA_SQL = `
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

const ACCOUNT_PREFERENCE_SCHEMA_SQL = `
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
`;

type MigrationContext = {
  checklistSchemaExisted: boolean;
};

type Migration = (db: Database, context: MigrationContext) => Promise<void>;

const migrations: Migration[] = [
  async (db, context) => {
    await db.execAsync(CHECKLIST_SCHEMA_SQL);
    await db.execAsync(ACCOUNT_PREFERENCE_SCHEMA_SQL);
    await db.runAsync(
      `INSERT INTO account_preferences
         (id, mode, cognito_sub, display_name, email)
       VALUES (1, ?, NULL, NULL, NULL)`,
      context.checklistSchemaExisted ? 'local' : 'unselected',
    );
  },
];

export async function runMigrations(db: Database): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const currentVersion = versionRow?.user_version ?? 0;
  if (currentVersion > migrations.length) {
    throw new Error(
      `Database version ${currentVersion} is newer than supported version ${migrations.length}.`,
    );
  }
  if (currentVersion === migrations.length) return;

  const checklistTable = await db.getFirstAsync<{ name: string }>(
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table' AND name = 'checklists'`,
  );
  const context: MigrationContext = {
    checklistSchemaExisted: checklistTable != null,
  };

  await db.withTransactionAsync(async () => {
    for (let index = currentVersion; index < migrations.length; index += 1) {
      await migrations[index](db, context);
      await db.execAsync(`PRAGMA user_version = ${index + 1};`);
    }
  });
}
