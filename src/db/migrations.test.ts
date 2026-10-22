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
    ).resolves.toEqual({ user_version: 4 });
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

  it('preserves every legacy routine while initializing local mode', async () => {
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
        'SELECT title FROM routines WHERE id = ?',
        'morning',
      ),
    ).resolves.toEqual({ title: 'Morning' });
    await expect(
      db.getFirstAsync<{ text: string }>(
        'SELECT text FROM steps WHERE id = ?',
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
         FROM routines
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
    ).resolves.toEqual({ user_version: 4 });
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
      CREATE INDEX checklists_unique_library_position ON checklists(title);
    `);

    await expect(runMigrations(database)).rejects.toMatchObject({
      message: expect.stringMatching(/index.*already exists/i),
    });

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
    await database.execAsync('CREATE TABLE account_preferences (id INTEGER PRIMARY KEY)');

    await expect(runMigrations(database)).rejects.toMatchObject({
      message: expect.stringMatching(/account_preferences.*already exists/i),
    });

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
  describe('version four: routines, steps, timers and colors', () => {
    const VERSION_THREE_LIBRARY = `
      CREATE TABLE checklists (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        library_position INTEGER
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
      CREATE UNIQUE INDEX checklists_unique_library_position
        ON checklists (library_position);
      CREATE TABLE account_preferences (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        mode TEXT NOT NULL,
        cognito_sub TEXT,
        display_name TEXT,
        email TEXT
      );
      INSERT INTO account_preferences (id, mode) VALUES (1, 'local');
      CREATE TABLE device_preferences (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        theme TEXT NOT NULL,
        sound TEXT NOT NULL,
        routine_reorder_hint_dismissed INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO device_preferences (id, theme, sound, routine_reorder_hint_dismissed)
      VALUES (1, 'dark', 'ping', 1);
      INSERT INTO checklists (id, title, created_at, updated_at, library_position)
      VALUES
        ('routine-a', 'Coral before', 1, 2, 0),
        ('routine-b', 'Blue before', 1, 2, 1),
        ('routine-c', 'Purple before', 1, 2, 2),
        ('routine-d', 'Olive before', 1, 2, 3),
        ('routine-e', 'Green before', 1, 2, 4);
      INSERT INTO checklist_items (id, checklist_id, position, text)
      VALUES
        ('a1', 'routine-a', 0, 'Stretch'),
        ('a2', 'routine-a', 1, 'Breathe'),
        ('e1', 'routine-e', 0, 'Water');
      PRAGMA user_version = 3;
    `;

    async function tableNames(db: Database) {
      const rows = await db.getAllAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
      );
      return rows.map((row) => row.name);
    }

    it('renames the tables and keeps every routine, step and preference', async () => {
      const db = createTestDatabase();
      await db.execAsync(VERSION_THREE_LIBRARY);

      await runMigrations(db);

      expect(await tableNames(db)).toEqual(
        expect.arrayContaining(['routines', 'steps']),
      );
      expect(await tableNames(db)).not.toEqual(
        expect.arrayContaining(['checklists']),
      );
      await expect(
        db.getAllAsync('SELECT id, title, library_position FROM routines ORDER BY library_position'),
      ).resolves.toEqual([
        { id: 'routine-a', title: 'Coral before', library_position: 0 },
        { id: 'routine-b', title: 'Blue before', library_position: 1 },
        { id: 'routine-c', title: 'Purple before', library_position: 2 },
        { id: 'routine-d', title: 'Olive before', library_position: 3 },
        { id: 'routine-e', title: 'Green before', library_position: 4 },
      ]);
      await expect(
        db.getAllAsync(
          'SELECT id, routine_id, position, text, timer_seconds FROM steps ORDER BY id',
        ),
      ).resolves.toEqual([
        { id: 'a1', routine_id: 'routine-a', position: 0, text: 'Stretch', timer_seconds: null },
        { id: 'a2', routine_id: 'routine-a', position: 1, text: 'Breathe', timer_seconds: null },
        { id: 'e1', routine_id: 'routine-e', position: 0, text: 'Water', timer_seconds: null },
      ]);
      await expect(devicePreference(db)).resolves.toEqual({
        theme: 'dark',
        sound: 'ping',
        routine_reorder_hint_dismissed: 1,
      });
      await expect(
        db.getFirstAsync('SELECT recent_timer_seconds FROM device_preferences WHERE id = 1'),
      ).resolves.toEqual({ recent_timer_seconds: '[]' });
      await expect(
        db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'),
      ).resolves.toEqual({ user_version: 4 });
    });

    it('stores the color each routine showed before, as its nearest of the thirty', async () => {
      const db = createTestDatabase();
      await db.execAsync(VERSION_THREE_LIBRARY);

      await runMigrations(db);

      await expect(
        db.getAllAsync('SELECT id, color FROM routines ORDER BY library_position'),
      ).resolves.toEqual([
        { id: 'routine-a', color: 'orange-1' },
        { id: 'routine-b', color: 'cyan-2' },
        { id: 'routine-c', color: 'violet-2' },
        { id: 'routine-d', color: 'lime-1' },
        { id: 'routine-e', color: 'green-2' },
      ]);
    });

    it('keeps deleting a routine deleting its steps after the rename', async () => {
      const db = createTestDatabase();
      await db.execAsync(VERSION_THREE_LIBRARY);
      await runMigrations(db);

      await db.runAsync('DELETE FROM routines WHERE id = ?', 'routine-a');

      await expect(
        db.getAllAsync('SELECT id FROM steps ORDER BY id'),
      ).resolves.toEqual([{ id: 'e1' }]);
    });

    it('rejects step timers outside one second to an hour', async () => {
      const db = createTestDatabase();
      await db.execAsync(VERSION_THREE_LIBRARY);
      await runMigrations(db);

      for (const bad of [0, 3601, -5]) {
        await expect(
          db.runAsync('UPDATE steps SET timer_seconds = ? WHERE id = ?', bad, 'a1'),
        ).rejects.toThrow(/constraint/i);
      }
      await db.runAsync('UPDATE steps SET timer_seconds = ? WHERE id = ?', 3600, 'a1');
    });

    it('changes nothing when the version-four migration fails', async () => {
      const db = createTestDatabase();
      await db.execAsync(VERSION_THREE_LIBRARY);
      await db.execAsync('CREATE TABLE routines (id TEXT);');

      await expect(runMigrations(db)).rejects.toThrow(/routines/i);

      await expect(
        db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'),
      ).resolves.toEqual({ user_version: 3 });
      await expect(
        db.getAllAsync('SELECT id FROM checklists ORDER BY library_position'),
      ).resolves.toHaveLength(5);
      await expect(
        db.getAllAsync<{ name: string }>('PRAGMA table_info(checklist_items)'),
      ).resolves.not.toContainEqual(expect.objectContaining({ name: 'timer_seconds' }));
    });
  });
});
