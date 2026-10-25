import { act, render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Database } from '@/src/db/database';
import { DatabaseProvider } from '@/src/db/DatabaseProvider';
import { runMigrations } from '@/src/db/migrations';
import { RoutineUndoProvider, type RoutineUndoStore } from '@/src/features/routines/routineUndo';
import { DevicePreferencesProvider } from '@/src/features/settings/DevicePreferencesProvider';
import { MemoryDevicePreferenceStore } from '@/src/features/settings/preferences';

import { createTestDatabase } from './createTestDatabase';

// A Pixel 7-sized window with no system insets.
const TEST_WINDOW_METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

export type RenderWithDatabaseResult = ReturnType<typeof render> & {
  database: Database;
};

export async function renderWithDatabase(
  ui: ReactElement,
  options: {
    database?: Database;
    preferences?: MemoryDevicePreferenceStore;
    /** What the routines screen is handed to offer UNDO for. */
    routineUndo?: RoutineUndoStore;
  } & Omit<RenderOptions, 'wrapper'> = {},
): Promise<RenderWithDatabaseResult> {
  const database = options.database ?? createTestDatabase();
  if (!options.database) {
    await runMigrations(database);
  }

  const preferences = options.preferences ?? new MemoryDevicePreferenceStore();
  const result = render(ui, {
    ...options,
    wrapper: ({ children }) => (
      <SafeAreaProvider initialMetrics={TEST_WINDOW_METRICS}>
        <DatabaseProvider database={database}>
          <DevicePreferencesProvider store={preferences}>
            <RoutineUndoProvider store={options.routineUndo}>{children}</RoutineUndoProvider>
          </DevicePreferencesProvider>
        </DatabaseProvider>
      </SafeAreaProvider>
    ),
  });

  // Flush async useEffect chains (e.g. initial data loads).
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  return { ...result, database };
}
