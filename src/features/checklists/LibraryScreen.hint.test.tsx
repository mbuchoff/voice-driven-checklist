import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Vibration } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';

import type { Database } from '@/src/db/database';
import { DatabaseProvider } from '@/src/db/DatabaseProvider';
import { runMigrations } from '@/src/db/migrations';
import {
  DevicePreferencesProvider,
} from '@/src/features/settings/DevicePreferencesProvider';
import { SqliteDevicePreferenceStore } from '@/src/features/settings/preferences';
import { createTestDatabase } from '@/src/test/createTestDatabase';

import { LibraryScreen } from './LibraryScreen';
import { createChecklist } from './repository';
import {
  ROUTINE_ARRANGE_LESSON_DURATION_MS,
  ROUTINE_ARRANGE_SWIPE_DISTANCE,
  shouldShowRoutineArrangeHint,
} from './RoutineArrangeHint';

const { getByGestureTestId } = jest.requireActual(
  'react-native-gesture-handler/lib/commonjs/jestUtils',
) as typeof import('react-native-gesture-handler/lib/typescript/jestUtils');

async function setupDb(routineCount: number): Promise<Database> {
  const database = createTestDatabase();
  await runMigrations(database);
  for (let index = 0; index < routineCount; index += 1) {
    await createChecklist(database, {
      title: `Routine ${index + 1}`,
      items: [{ text: `Step ${index + 1}` }],
    });
  }
  return database;
}

async function renderLibrary(database: Database, routineCount: number) {
  const view = render(
    <DatabaseProvider database={database}>
      <DevicePreferencesProvider
        store={new SqliteDevicePreferenceStore(database)}
      >
        <LibraryScreen
          onCreate={jest.fn()}
          onEdit={jest.fn()}
          onStart={jest.fn()}
        />
      </DevicePreferencesProvider>
    </DatabaseProvider>,
  );
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  await screen.findByTestId(routineCount ? 'routine-grid' : 'library-empty-state');
  return view;
}

function hintSwipeGesture() {
  return getByGestureTestId('routine-arrange-hint-swipe') as GestureType;
}

async function swipeHint(translationX: number) {
  const gesture = hintSwipeGesture();
  await act(async () => {
    gesture.handlers.onStart?.({ translationX: 0 } as never);
    gesture.handlers.onUpdate?.({ translationX } as never);
    gesture.handlers.onEnd?.({ translationX } as never, true);
    gesture.handlers.onFinalize?.({ translationX } as never, true);
    await Promise.resolve();
  });
}

describe('LibraryScreen routine-arrangement teaching', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows the hint only when at least two routines need teaching', () => {
    expect(shouldShowRoutineArrangeHint(0, false)).toBe(false);
    expect(shouldShowRoutineArrangeHint(1, false)).toBe(false);
    expect(shouldShowRoutineArrangeHint(2, false)).toBe(true);
    expect(shouldShowRoutineArrangeHint(2, true)).toBe(false);
  });

  it('reserves horizontal swipes for the hint and vertical movement for scrolling', async () => {
    const database = await setupDb(2);
    await renderLibrary(database, 2);

    expect(hintSwipeGesture().config).toEqual(
      expect.objectContaining({
        activeOffsetXStart: -8,
        activeOffsetXEnd: 8,
        failOffsetYStart: -8,
        failOffsetYEnd: 8,
      }),
    );
  });

  it.each([-1, 1])(
    'permanently dismisses a completed swipe in direction %i without haptics',
    async (direction) => {
      const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation();
      const database = await setupDb(2);
      const view = await renderLibrary(database, 2);

      await swipeHint(
        direction * (ROUTINE_ARRANGE_SWIPE_DISTANCE + 12),
      );

      await waitFor(() => {
        expect(screen.queryByTestId('routine-arrange-hint')).toBeNull();
      });
      expect(vibrate).not.toHaveBeenCalled();
      expect(
        await database.getFirstAsync<{ dismissed: number }>(
          `SELECT routine_reorder_hint_dismissed AS dismissed
           FROM device_preferences WHERE id = 1`,
        ),
      ).toEqual({ dismissed: 1 });

      view.unmount();
      await renderLibrary(database, 2);
      expect(screen.queryByTestId('routine-arrange-hint')).toBeNull();
    },
  );

  it('returns an incomplete swipe to rest and keeps the hint', async () => {
    const database = await setupDb(2);
    await renderLibrary(database, 2);

    await swipeHint(ROUTINE_ARRANGE_SWIPE_DISTANCE - 1);

    expect(screen.getByTestId('routine-arrange-hint')).toBeOnTheScreen();
    expect(
      await database.getFirstAsync<{ dismissed: number }>(
        `SELECT routine_reorder_hint_dismissed AS dismissed
         FROM device_preferences WHERE id = 1`,
      ),
    ).toEqual({ dismissed: 0 });
  });

  it('plays the full-screen lesson, then closes it after the approved duration', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation();
    const database = await setupDb(2);
    await renderLibrary(database, 2);
    jest.useFakeTimers();

    fireEvent.press(
      screen.getByRole('button', { name: /learn how to move routines/i }),
    );
    act(() => {
      jest.advanceTimersByTime(32);
    });

    const modal = screen.getByTestId('routine-arrange-lesson-modal');
    expect(modal.props.statusBarTranslucent).toBe(true);
    expect(modal.props.navigationBarTranslucent).toBe(true);
    expect(screen.getByTestId('routine-arrange-lesson-dimmer')).toBeOnTheScreen();
    expect(
      screen.getByTestId('routine-arrange-lesson-source', {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId('routine-arrange-lesson-destination'),
    ).toBeOnTheScreen();
    expect(vibrate).not.toHaveBeenCalled();

    expect(screen.getByTestId('routine-arrange-lesson-modal')).toBeOnTheScreen();
    act(() => {
      jest.advanceTimersByTime(ROUTINE_ARRANGE_LESSON_DURATION_MS - 1);
    });
    expect(screen.getByTestId('routine-arrange-lesson-modal')).toBeOnTheScreen();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId('routine-arrange-lesson-modal')).toBeNull();
    expect(screen.getByTestId('routine-arrange-hint')).toBeOnTheScreen();
  });

  it('closes the lesson on Android Back without dismissing the hint', async () => {
    const database = await setupDb(2);
    await renderLibrary(database, 2);
    fireEvent.press(
      screen.getByRole('button', { name: /learn how to move routines/i }),
    );

    fireEvent(
      await screen.findByTestId('routine-arrange-lesson-modal'),
      'requestClose',
    );

    expect(screen.queryByTestId('routine-arrange-lesson-modal')).toBeNull();
    expect(screen.getByTestId('routine-arrange-hint')).toBeOnTheScreen();
  });
});
