import { runMigrations } from '@/src/db/migrations';
import { createTestDatabase } from '@/src/test/createTestDatabase';

import { rememberTime, SqliteDevicePreferenceStore } from './preferences';

describe('device preferences', () => {
  it('loads the System theme and Soft Chime defaults', async () => {
    const database = createTestDatabase();
    await runMigrations(database);

    await expect(new SqliteDevicePreferenceStore(database).load()).resolves.toEqual({
      theme: 'system',
      sound: 'chime',
      routineReorderHintDismissed: false,
      recentTimerSeconds: [],
    });
  });

  it('persists theme and sound choices across store instances', async () => {
    const database = createTestDatabase();
    await runMigrations(database);
    const store = new SqliteDevicePreferenceStore(database);

    await store.saveTheme('dark');
    await store.saveSound('wood');

    await expect(new SqliteDevicePreferenceStore(database).load()).resolves.toEqual({
      theme: 'dark',
      sound: 'wood',
      routineReorderHintDismissed: false,
      recentTimerSeconds: [],
    });
  });

  it('updates one preference without resetting the other', async () => {
    const database = createTestDatabase();
    await runMigrations(database);
    const store = new SqliteDevicePreferenceStore(database);
    await store.saveTheme('light');
    await store.saveSound('ping');

    await store.saveTheme('dark');

    await expect(store.load()).resolves.toEqual({
      theme: 'dark',
      sound: 'ping',
      routineReorderHintDismissed: false,
      recentTimerSeconds: [],
    });
  });

  it('persists routine reorder hint dismissal without changing other preferences', async () => {
    const database = createTestDatabase();
    await runMigrations(database);
    const store = new SqliteDevicePreferenceStore(database);
    await store.saveTheme('dark');
    await store.saveSound('wood');

    await store.dismissRoutineReorderHint();

    await expect(new SqliteDevicePreferenceStore(database).load()).resolves.toEqual({
      theme: 'dark',
      sound: 'wood',
      routineReorderHintDismissed: true,
      recentTimerSeconds: [],
    });
  });

  it('remembers the timer lengths last used on this device across store instances', async () => {
    const database = createTestDatabase();
    await runMigrations(database);

    await new SqliteDevicePreferenceStore(database).saveRecentTimerSeconds([90, 30, 300]);

    await expect(new SqliteDevicePreferenceStore(database).load()).resolves.toMatchObject({
      recentTimerSeconds: [90, 30, 300],
    });
  });

  it('treats a damaged list of remembered timer lengths as empty', async () => {
    const database = createTestDatabase();
    await runMigrations(database);
    await database.runAsync(
      `UPDATE device_preferences SET recent_timer_seconds = 'not json' WHERE id = 1`,
    );

    await expect(new SqliteDevicePreferenceStore(database).load()).resolves.toMatchObject({
      recentTimerSeconds: [],
    });
  });
});

describe('remembered timer lengths', () => {
  it('remembers a used time first, without duplicates, keeping four', () => {
    expect(rememberTime([], 90)).toEqual([90]);
    expect(rememberTime([30, 60, 90, 120], 90)).toEqual([90, 30, 60, 120]);
    expect(rememberTime([30, 60, 90, 120], 45)).toEqual([45, 30, 60, 90]);
  });
});
