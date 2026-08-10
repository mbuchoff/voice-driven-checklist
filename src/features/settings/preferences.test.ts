import { runMigrations } from '@/src/db/migrations';
import { createTestDatabase } from '@/src/test/createTestDatabase';

import { SqliteDevicePreferenceStore } from './preferences';

describe('device preferences', () => {
  it('loads the System theme and Soft Chime defaults', async () => {
    const database = createTestDatabase();
    await runMigrations(database);

    await expect(new SqliteDevicePreferenceStore(database).load()).resolves.toEqual({
      theme: 'system',
      sound: 'chime',
    });
  });

  it('persists theme and sound choices across store instances', async () => {
    const database = createTestDatabase();
    await runMigrations(database);
    const store = new SqliteDevicePreferenceStore(database);

    await store.save({ theme: 'dark', sound: 'wood' });

    await expect(new SqliteDevicePreferenceStore(database).load()).resolves.toEqual({
      theme: 'dark',
      sound: 'wood',
    });
  });

  it('updates one preference without resetting the other', async () => {
    const database = createTestDatabase();
    await runMigrations(database);
    const store = new SqliteDevicePreferenceStore(database);
    await store.save({ theme: 'light', sound: 'ping' });

    await store.saveTheme('dark');

    await expect(store.load()).resolves.toEqual({ theme: 'dark', sound: 'ping' });
  });
});
