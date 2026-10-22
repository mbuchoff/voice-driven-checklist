import { Stack, router } from 'expo-router';
import { fireEvent, renderRouter, screen, testRouter, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import EditRoutineRoute from '../../../app/routines/[id]/edit';
import { DatabaseProvider } from '@/src/db/DatabaseProvider';
import { runMigrations } from '@/src/db/migrations';
import { DevicePreferencesProvider } from '@/src/features/settings/DevicePreferencesProvider';
import { MemoryDevicePreferenceStore } from '@/src/features/settings/preferences';
import { createTestDatabase } from '@/src/test/createTestDatabase';

import { createRoutine, getRoutine } from './repository';
import { takeRoutineUndo } from './routineUndo';

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it.each([false, true])('returns to a single library after deletion (direct entry: %s)', async (directEntry) => {
  const database = createTestDatabase();
  await runMigrations(database);
  const routines = [];
  for (const title of ['First', 'Second']) {
    routines.push(await createRoutine(database, { title, steps: [{ text: 'A step' }] }));
  }
  try {
    const routes = renderRouter({
      _layout: () => (
        <SafeAreaProvider
          initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
        >
          <DatabaseProvider database={database}>
            <DevicePreferencesProvider store={new MemoryDevicePreferenceStore()}>
              <Stack screenOptions={{ animation: 'none' }} />
            </DevicePreferencesProvider>
          </DatabaseProvider>
        </SafeAreaProvider>
      ),
      index: () => <Text testID="test-library">Library</Text>,
      'routines/[id]/edit': EditRoutineRoute,
    }, { initialUrl: directEntry ? `/routines/${routines[0].id}/edit` : '/' });

    // Preferences load before any screen mounts; navigate once one has.
    await screen.findByTestId(directEntry ? 'editor-delete' : 'test-library');
    for (const [index, routine] of routines.entries()) {
      if (!directEntry || index > 0) testRouter.push(`/routines/${routine.id}/edit`);
      fireEvent.press(await screen.findByTestId('editor-delete'));
      fireEvent.press(await screen.findByTestId('delete-confirm'));
      await screen.findByTestId('test-library');
      await expect(getRoutine(database, routine.id)).resolves.toBeNull();
      expect(takeRoutineUndo()?.routine.id).toBe(routine.id);
    }

    await waitFor(() => expect(router.canGoBack()).toBe(false));
    expect(routes.getPathname()).toBe('/');
  } finally {
    await database.closeAsync();
  }
});
