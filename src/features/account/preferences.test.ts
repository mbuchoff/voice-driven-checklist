import { runMigrations } from '@/src/db/migrations';
import { createTestDatabase } from '@/src/test/createTestDatabase';

import { SqliteAccountPreferenceStore } from './preferences';

describe('SQLite account preferences', () => {
  it('loads the fresh-install account choice', async () => {
    const database = createTestDatabase();
    await runMigrations(database);

    const store = new SqliteAccountPreferenceStore(database);

    await expect(store.load()).resolves.toEqual({ mode: 'unselected' });
  });

  it('remembers local mode across store instances', async () => {
    const database = createTestDatabase();
    await runMigrations(database);
    await new SqliteAccountPreferenceStore(database).save({ mode: 'local' });

    const restored = new SqliteAccountPreferenceStore(database);

    await expect(restored.load()).resolves.toEqual({ mode: 'local' });
  });

  it('persists the Cognito identity without credentials', async () => {
    const database = createTestDatabase();
    await runMigrations(database);
    const store = new SqliteAccountPreferenceStore(database);

    await store.save({
      mode: 'google',
      identity: {
        sub: 'cognito-subject',
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    });

    await expect(store.load()).resolves.toEqual({
      mode: 'google',
      identity: {
        sub: 'cognito-subject',
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    });
    await expect(
      database.getFirstAsync<{
        mode: string;
        cognito_sub: string | null;
        display_name: string | null;
        email: string | null;
      }>(
        `SELECT mode, cognito_sub, display_name, email
         FROM account_preferences
         WHERE id = 1`,
      ),
    ).resolves.toEqual({
      mode: 'google',
      cognito_sub: 'cognito-subject',
      display_name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
  });

  it('clears the cached Google identity when local mode is selected', async () => {
    const database = createTestDatabase();
    await runMigrations(database);
    const store = new SqliteAccountPreferenceStore(database);
    await store.save({
      mode: 'google',
      identity: {
        sub: 'cognito-subject',
        displayName: null,
        email: 'ada@example.com',
      },
    });

    await store.save({ mode: 'local' });

    await expect(store.load()).resolves.toEqual({ mode: 'local' });
  });

  it('keeps tokens and authorization codes out of SQLite', async () => {
    const database = createTestDatabase();
    await runMigrations(database);

    const columns = await database.getAllAsync<{ name: string }>(
      'PRAGMA table_info(account_preferences)',
    );

    expect(columns.map((column) => column.name)).toEqual([
      'id',
      'mode',
      'cognito_sub',
      'display_name',
      'email',
    ]);
  });
});
