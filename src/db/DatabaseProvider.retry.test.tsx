import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as SQLite from 'expo-sqlite';

import { createChecklist, getChecklist } from '@/src/features/checklists/repository';
import { createTestDatabase } from '@/src/test/createTestDatabase';

import { AppDatabaseProvider } from './DatabaseProvider';
import { runMigrations } from './migrations';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

it('retries the production opener and preserves the existing library and preferences', async () => {
  const database = createTestDatabase();
  await runMigrations(database);
  const routine = await createChecklist(database, {
    title: 'Kept routine',
    items: [{ text: 'Kept step' }],
  });
  await database.execAsync(`
    UPDATE device_preferences
      SET theme = 'dark', sound = 'wood', routine_reorder_hint_dismissed = 1;
    UPDATE account_preferences SET mode = 'local';
  `);
  jest.mocked(SQLite.openDatabaseAsync)
    .mockRejectedValueOnce(new Error('Temporary SQLite open failure'))
    .mockResolvedValue(database as unknown as SQLite.SQLiteDatabase);

  try {
    render(
      <AppDatabaseProvider>
        <Text testID="opened-library">Library</Text>
      </AppDatabaseProvider>,
    );
    expect(await screen.findByTestId('database-open-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('database-open-retry'));

    await waitFor(() => {
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('opened-library')).toBeOnTheScreen();
    });
    await expect(getChecklist(database, routine.id)).resolves.toEqual(routine);
    await expect(database.getFirstAsync(
      'SELECT theme, sound, routine_reorder_hint_dismissed FROM device_preferences',
    )).resolves.toEqual({ theme: 'dark', sound: 'wood', routine_reorder_hint_dismissed: 1 });
    await expect(database.getFirstAsync('SELECT mode FROM account_preferences'))
      .resolves.toEqual({ mode: 'local' });
  } finally {
    await database.closeAsync();
  }
});
