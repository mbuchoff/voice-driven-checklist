import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { runMigrations } from './migrations';
import { AppDatabaseProvider } from './DatabaseProvider';
import { createTestDatabase } from '@/src/test/createTestDatabase';

jest.mock('./openDatabase', () => ({
  openDatabase: () => Promise.reject(new Error('Use the injected test opener.')),
}));

describe('AppDatabaseProvider', () => {
  it('keeps data intact and retries after the database cannot open', async () => {
    const database = createTestDatabase();
    await runMigrations(database);
    let attempts = 0;
    const open = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('simulated open failure');
      return database;
    };

    render(
      <AppDatabaseProvider open={open}>
        <Text testID="database-child">Library</Text>
      </AppDatabaseProvider>,
    );

    expect(await screen.findByTestId('database-open-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('database-child')).not.toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('database-open-retry'));

    await waitFor(() => {
      expect(screen.getByTestId('database-child')).toBeOnTheScreen();
    });
    expect(attempts).toBe(2);
    await expect(
      database.getFirstAsync<{ user_version: number }>('PRAGMA user_version'),
    ).resolves.toEqual({ user_version: 3 });
  });
});
