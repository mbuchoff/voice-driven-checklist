import { createTestDatabase } from '@/src/test/createTestDatabase';

import type { Database } from './database';
import { runMigrations } from './migrations';

const LEGACY_SCHEMA = `
CREATE TABLE checklists (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE checklist_items (
  id TEXT PRIMARY KEY NOT NULL,
  checklist_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX checklist_items_unique_position
  ON checklist_items (checklist_id, position);
`;

type AccountPreferenceRow = {
  mode: string;
  cognito_sub: string | null;
  display_name: string | null;
  email: string | null;
};

type DevicePreferenceRow = {
  theme: string;
  sound: string;
  routine_reorder_hint_dismissed: number;
};

async function accountPreference(db: Database): Promise<AccountPreferenceRow | null> {
  return db.getFirstAsync<AccountPreferenceRow>(
    `SELECT mode, cognito_sub, display_name, email
     FROM account_preferences
     WHERE id = 1`,
  );
}

async function devicePreference(db: Database): Promise<DevicePreferenceRow | null> {
  return db.getFirstAsync<DevicePreferenceRow>(
    `SELECT theme, sound, routine_reorder_hint_dismissed
     FROM device_preferences
     WHERE id = 1`,
  );
}

describe('database migrations', () => {
  it('initializes a fresh database with an unselected account mode', async () => {
    const db = createTestDatabase();

    await runMigrations(db);

    await expect(accountPreference(db)).resolves.toEqual({
      mode: 'unselected',
      cognito_sub: null,
      display_name: null,
      email: null,
    });
    await expect(
      db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'),
    ).resolves.toEqual({ user_version: 3 });
    await expect(devicePreference(db)).resolves.toEqual({
      theme: 'system',
      sound: 'chime',
      routine_reorder_hint_dismissed: 0,
    });
  });

  it('initializes a legacy empty library in local mode', async () => {
    const db = createTestDatabase();
    await db.execAsync(LEGACY_SCHEMA);

    await runMigrations(db);

    await expect(accountPreference(db)).resolves.toMatchObject({ mode: 'local' });
  });

  it('preserves every legacy checklist while initializing local mode', async () => {
    const db = createTestDatabase();
    await db.execAsync(LEGACY_SCHEMA);
    await db.runAsync(
      'INSERT INTO checklists (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
      'morning',
      'Morning',
      100,
      200,
    );
    await db.runAsync(
      'INSERT INTO checklist_items (id, checklist_id, position, text) VALUES (?, ?, ?, ?)',
      'coffee',
      'morning',
      0,
      'Make coffee',
    );

    await runMigrations(db);

    await expect(accountPreference(db)).resolves.toMatchObject({ mode: 'local' });
    await expect(
      db.getFirstAsync<{ title: string }>(
        'SELECT title FROM checklists WHERE id = ?',
        'morning',
      ),
    ).resolves.toEqual({ title: 'Morning' });
    await expect(
      db.getFirstAsync<{ text: string }>(
        'SELECT text FROM checklist_items WHERE id = ?',
        'coffee',
      ),
    ).resolves.toEqual({ text: 'Make coffee' });
    await expect(devicePreference(db)).resolves.toEqual({
      theme: 'system',
      sound: 'chime',
      routine_reorder_hint_dismissed: 0,
    });
  });

  it('adds device preferences without changing an existing account choice', async () => {
    const db = createTestDatabase();
    await db.execAsync(LEGACY_SCHEMA);
    await db.execAsync(`
      CREATE TABLE account_preferences (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        mode TEXT NOT NULL CHECK (mode IN ('unselected', 'local', 'google')),
        cognito_sub TEXT,
        display_name TEXT,
        email TEXT
      );
      INSERT INTO account_preferences
        (id, mode, cognito_sub, display_name, email)
      VALUES (1, 'google', 'subject', 'Ada', 'ada@example.com');
      PRAGMA user_version = 1;
    `);

    await runMigrations(db);

    await expect(accountPreference(db)).resolves.toEqual({
      mode: 'google',
      cognito_sub: 'subject',
      display_name: 'Ada',
      email: 'ada@example.com',
    });
    await expect(devicePreference(db)).resolves.toEqual({
      theme: 'system',
      sound: 'chime',
      routine_reorder_hint_dismissed: 0,
    });
  });

  it('preserves the visible version-two library order as explicit positions', async () => {
    const db = createTestDatabase();
    await db.execAsync(LEGACY_SCHEMA);
    await db.execAsync(`
      CREATE TABLE account_preferences (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        mode TEXT NOT NULL,
        cognito_sub TEXT,
        display_name TEXT,
        email TEXT
      );
      INSERT INTO account_preferences
        (id, mode, cognito_sub, display_name, email)
      VALUES (1, 'local', NULL, NULL, NULL);

      CREATE TABLE device_preferences (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        theme TEXT NOT NULL,
        sound TEXT NOT NULL
      );
      INSERT INTO device_preferences (id, theme, sound)
      VALUES (1, 'dark', 'wood');

      INSERT INTO checklists (id, title, created_at, updated_at)
      VALUES
        ('older', 'Older', 10, 10),
        ('zulu', 'Zulu', 20, 30),
        ('alpha', 'Alpha', 30, 30);

      PRAGMA user_version = 2;
    `);

    await runMigrations(db);

    await expect(
      db.getAllAsync<{ id: string; library_position: number }>(
        `SELECT id, library_position
         FROM checklists
         ORDER BY library_position ASC`,
      ),
    ).resolves.toEqual([
      { id: 'alpha', library_position: 0 },
      { id: 'zulu', library_position: 1 },
      { id: 'older', library_position: 2 },
    ]);
    await expect(devicePreference(db)).resolves.toEqual({
      theme: 'dark',
      sound: 'wood',
      routine_reorder_hint_dismissed: 0,
    });
    await expect(
      db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'),
    ).resolves.toEqual({ user_version: 3 });
  });

  it('rolls back version-three ordering when its migration fails', async () => {
    const database = createTestDatabase();
    await database.execAsync(LEGACY_SCHEMA);
    await database.execAsync(`
      CREATE TABLE account_preferences (
        id INTEGER PRIMARY KEY NOT NULL,
        mode TEXT NOT NULL,
        cognito_sub TEXT,
        display_name TEXT,
        email TEXT
      );
      INSERT INTO account_preferences
        (id, mode, cognito_sub, display_name, email)
      VALUES (1, 'local', NULL, NULL, NULL);
      CREATE TABLE device_preferences (
        id INTEGER PRIMARY KEY NOT NULL,
        theme TEXT NOT NULL,
        sound TEXT NOT NULL
      );
      INSERT INTO device_preferences (id, theme, sound)
      VALUES (1, 'system', 'chime');
      PRAGMA user_version = 2;
    `);
    const failingDatabase: Database = {
      ...database,
      async execAsync(source) {
        if (source.includes('CREATE UNIQUE INDEX checklists_unique_library_position')) {
          throw new Error('simulated ordering migration failure');
        }
        await database.execAsync(source);
      },
    };

    await expect(runMigrations(failingDatabase)).rejects.toThrow(
      'simulated ordering migration failure',
    );

    await expect(
      database.getFirstAsync<{ user_version: number }>('PRAGMA user_version'),
    ).resolves.toEqual({ user_version: 2 });
    await expect(
      database.getAllAsync<{ name: string }>('PRAGMA table_info(checklists)'),
    ).resolves.not.toContainEqual(
      expect.objectContaining({ name: 'library_position' }),
    );
  });

  it('is idempotent and keeps a single preference record', async () => {
    const db = createTestDatabase();

    await runMigrations(db);
    await runMigrations(db);

    await expect(
      db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM account_preferences',
      ),
    ).resolves.toEqual({ count: 1 });
    await expect(accountPreference(db)).resolves.toMatchObject({ mode: 'unselected' });
  });

  it('rolls back schema and version changes when a migration fails', async () => {
    const database = createTestDatabase();
    const failingDatabase: Database = {
      ...database,
      async execAsync(source) {
        if (source.includes('CREATE TABLE account_preferences')) {
          throw new Error('simulated migration failure');
        }
        await database.execAsync(source);
      },
    };

    await expect(runMigrations(failingDatabase)).rejects.toThrow(
      'simulated migration failure',
    );

    await expect(
      database.getFirstAsync<{ user_version: number }>('PRAGMA user_version'),
    ).resolves.toEqual({ user_version: 0 });
    await expect(
      database.getFirstAsync<{ name: string }>(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name = 'checklists'`,
      ),
    ).resolves.toBeNull();
  });
});
