import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text, useColorScheme } from 'react-native';

import { runMigrations } from './migrations';
import { AppDatabaseProvider } from './DatabaseProvider';
import { createTestDatabase } from '@/src/test/createTestDatabase';
import { dark, light } from '@/src/theme/palette';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('./openDatabase', () => ({
  openDatabase: () => Promise.reject(new Error('Use the injected test opener.')),
}));

describe('AppDatabaseProvider', () => {
  it.each(['light', 'dark'] as const)('uses the %s palette and retries without changing data', async (scheme) => {
    jest.mocked(useColorScheme).mockReturnValue(scheme);
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
    expect(screen.getByTestId('database-open-error')).toHaveStyle({
      backgroundColor: (scheme === 'dark' ? dark : light).background,
    });
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
