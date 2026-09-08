import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createTestDatabase } from '@/src/test/createTestDatabase';
import type { Database } from './database';

const mockOpen = jest.fn();
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: mockOpen }));

function freshOpener(): typeof import('./openDatabase').openDatabase {
  let open!: typeof import('./openDatabase').openDatabase;
  jest.isolateModules(() => {
    open = jest.requireActual<typeof import('./openDatabase')>('./openDatabase').openDatabase;
  });
  return open;
}

beforeEach(() => mockOpen.mockReset());

it('shares an in-flight open and retains the successfully initialized connection', async () => {
  const database = createTestDatabase();
  let complete!: (database: Database) => void;
  mockOpen.mockReturnValue(new Promise<Database>(resolveOpen => { complete = resolveOpen; }));
  const open = freshOpener();
  try {
    const first = open();
    expect(open()).toBe(first);
    expect(mockOpen).toHaveBeenCalledTimes(1);
    complete(database);
    await expect(first).resolves.toBe(database);
    expect(open()).toBe(first);
    expect(mockOpen).toHaveBeenCalledTimes(1);
    await expect(database.getFirstAsync('PRAGMA user_version')).resolves.toEqual({ user_version: 3 });
  } finally {
    await database.closeAsync();
  }
});

it('closes a failed migration connection and safely retries the same persisted library', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'voice-checklist-open-'));
  const filename = join(directory, 'library.db');
  const seed = createTestDatabase(filename);
  await seed.execAsync(readFileSync(resolve(__dirname, '../../e2e/fixtures/schema-v2.sql'), 'utf8'));
  await seed.execAsync(`
    INSERT INTO account_preferences (id,mode) VALUES (1,'local');
    INSERT INTO device_preferences (id,theme,sound) VALUES (1,'dark','wood');
    INSERT INTO checklists (id,title,created_at,updated_at) VALUES ('kept','Kept routine',1,2);
    INSERT INTO checklist_items (id,checklist_id,position,text) VALUES ('kept-step','kept',0,'Kept step');
    CREATE INDEX checklists_unique_library_position ON checklists(title);
  `);
  await seed.closeAsync();
  const connections: { database: Database; close: jest.SpyInstance }[] = [];
  mockOpen.mockImplementation(async () => {
    const database = createTestDatabase(filename);
    connections.push({ database, close: jest.spyOn(database, 'closeAsync') });
    return database;
  });
  const open = freshOpener();
  try {
    await expect(open()).rejects.toMatchObject({ message: expect.stringMatching(/index.*already exists/i) });
    expect(connections[0].close).toHaveBeenCalledTimes(1);

    const recovery = createTestDatabase(filename);
    try {
      await expect(recovery.getFirstAsync('PRAGMA user_version')).resolves.toEqual({ user_version: 2 });
      await expect(recovery.getAllAsync<{ name: string }>('PRAGMA table_info(checklists)'))
        .resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'library_position' })]));
      await expect(recovery.getAllAsync('SELECT id,title,created_at,updated_at FROM checklists'))
        .resolves.toEqual([{ id: 'kept', title: 'Kept routine', created_at: 1, updated_at: 2 }]);
      await recovery.execAsync('DROP INDEX checklists_unique_library_position');
    } finally {
      await recovery.closeAsync();
    }

    const database = await open();
    expect(mockOpen).toHaveBeenCalledTimes(2);
    await expect(database.getFirstAsync('PRAGMA user_version')).resolves.toEqual({ user_version: 3 });
    await expect(database.getAllAsync('SELECT id,title,library_position FROM checklists'))
      .resolves.toEqual([{ id: 'kept', title: 'Kept routine', library_position: 0 }]);
    await expect(database.getAllAsync('SELECT text FROM checklist_items')).resolves.toEqual([{ text: 'Kept step' }]);
    await expect(database.getFirstAsync('SELECT theme,sound FROM device_preferences'))
      .resolves.toEqual({ theme: 'dark', sound: 'wood' });
    await expect(database.getFirstAsync('SELECT mode FROM account_preferences')).resolves.toEqual({ mode: 'local' });
  } finally {
    for (const { database, close } of connections) {
      if (close.mock.calls.length === 0) await database.closeAsync();
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
