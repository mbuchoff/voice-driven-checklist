import { Stack, router } from 'expo-router';
import { fireEvent, renderRouter, screen, testRouter, waitFor } from 'expo-router/testing-library';
import { Alert, Text } from 'react-native';

import EditRoutineRoute from '../../../app/routines/[id]/edit';
import { DatabaseProvider } from '@/src/db/DatabaseProvider';
import { runMigrations } from '@/src/db/migrations';
import { createTestDatabase } from '@/src/test/createTestDatabase';

import { createRoutine, getRoutine } from './repository';

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
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find(button => button.text === 'Delete')?.onPress?.();
  });
  try {
    const routes = renderRouter({
      _layout: () => (
        <DatabaseProvider database={database}>
          <Stack screenOptions={{ animation: 'none' }} />
        </DatabaseProvider>
      ),
      index: () => <Text testID="test-library">Library</Text>,
      'routines/[id]/edit': EditRoutineRoute,
    }, { initialUrl: directEntry ? `/routines/${routines[0].id}/edit` : '/' });

    for (const [index, routine] of routines.entries()) {
      if (!directEntry || index > 0) testRouter.push(`/routines/${routine.id}/edit`);
      fireEvent.press(await screen.findByTestId('routine-delete'));
      await screen.findByTestId('test-library');
      await expect(getRoutine(database, routine.id)).resolves.toBeNull();
    }

    await waitFor(() => expect(router.canGoBack()).toBe(false));
    expect(routes.getPathname()).toBe('/');
  } finally {
    await database.closeAsync();
  }
});
