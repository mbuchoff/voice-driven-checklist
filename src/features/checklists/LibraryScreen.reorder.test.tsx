import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  AccessibilityInfo,
  Alert,
  BackHandler,
  Vibration,
} from 'react-native';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import * as Reanimated from 'react-native-reanimated';

import type { Database } from '@/src/db/database';
import { runMigrations } from '@/src/db/migrations';
import { createTestDatabase } from '@/src/test/createTestDatabase';
import { renderWithDatabase } from '@/src/test/renderWithDatabase';

import { LibraryScreen } from './LibraryScreen';
import { createChecklist, listChecklists } from './repository';

const { getByGestureTestId } = jest.requireActual(
  'react-native-gesture-handler/lib/commonjs/jestUtils',
) as typeof import('react-native-gesture-handler/lib/typescript/jestUtils');

async function setupDb(): Promise<Database> {
  const database = createTestDatabase();
  await runMigrations(database);
  return database;
}

async function seedThree(database: Database) {
  const last = await createChecklist(database, {
    title: 'Last',
    items: [{ text: 'Last step' }],
  });
  const middle = await createChecklist(database, {
    title: 'Middle',
    items: [{ text: 'Middle step' }],
  });
  const first = await createChecklist(database, {
    title: 'First',
    items: [{ text: 'First step' }],
  });
  return { first, middle, last };
}

async function renderLibrary(database: Database) {
  const onEdit = jest.fn();
  await renderWithDatabase(
    <LibraryScreen
      onCreate={jest.fn()}
      onEdit={onEdit}
      onStart={jest.fn()}
    />,
    { database },
  );
  await screen.findByTestId('routine-grid');
  fireEvent(screen.getByTestId('routine-grid'), 'layout', {
    nativeEvent: { layout: { width: 361, height: 396 } },
  });
  return { onEdit };
}

function dragGesture(id: string) {
  return getByGestureTestId(`routine-hold-gesture-${id}`) as GestureType;
}

async function beginDrag(gesture: GestureType) {
  await act(async () => {
    gesture.handlers.onBegin?.({} as never);
    gesture.handlers.onStart?.({
      absoluteX: 87,
      absoluteY: 160,
      translationX: 0,
      translationY: 0,
      velocityX: 0,
      velocityY: 0,
    } as never);
    await Promise.resolve();
  });
}

describe('LibraryScreen routine reordering', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('suppresses accidental taps for a full interval after releasing a drag', async () => {
    jest.spyOn(Vibration, 'vibrate').mockImplementation();
    const database = await setupDb();
    const { first } = await seedThree(database);
    const { onEdit } = await renderLibrary(database);
    jest.useFakeTimers();
    const gesture = dragGesture(first.id);
    await beginDrag(gesture);
    act(() => jest.advanceTimersByTime(300));
    await act(async () => {
      gesture.handlers.onEnd?.({} as never, true);
      gesture.handlers.onFinalize?.({} as never, true);
    });
    act(() => jest.advanceTimersByTime(100));
    fireEvent.press(screen.getByTestId(`routine-card-action-${first.id}`));
    expect(onEdit).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(301));
    fireEvent.press(screen.getByTestId(`routine-card-action-${first.id}`));
    expect(onEdit).toHaveBeenCalledWith(first.id);
  });

  it('runs the frame subscription only during an active drag', async () => {
    jest.spyOn(Vibration, 'vibrate').mockImplementation();
    const frames = jest.spyOn(Reanimated, 'useFrameCallback');
    const pans = jest.spyOn(Gesture, 'Pan');
    const database = await setupDb();
    const { first } = await seedThree(database);
    await renderLibrary(database);
    const controller = frames.mock.results.at(-1)?.value;
    expect(controller.isActive).toBe(false);
    const idleCallback = frames.mock.calls.at(-1)?.[0];
    const gesture = dragGesture(first.id);
    const registrations = pans.mock.calls.length;
    await beginDrag(gesture);
    expect(controller.isActive).toBe(true);
    expect(dragGesture(first.id)).toBe(gesture);
    expect(pans).toHaveBeenCalledTimes(registrations);
    expect(frames.mock.calls.at(-1)?.[0]).toBe(idleCallback);
    await act(async () => {
      gesture.handlers.onEnd?.({} as never, false);
      gesture.handlers.onFinalize?.({} as never, false);
    });
    expect(controller.isActive).toBe(false);
    expect(dragGesture(first.id)).toBe(gesture);
  });

  it('allows small radial drift but yields to a deliberate pre-activation scroll', async () => {
    const database = await setupDb();
    const { first } = await seedThree(database);
    await renderLibrary(database);

    const gesture = dragGesture(first.id);
    const manager = { activate: jest.fn(), fail: jest.fn() };
    await act(async () => {
      gesture.handlers.onTouchesDown?.({ numberOfTouches: 1,
        allTouches: [{ absoluteX: 80, absoluteY: 160 }] } as never, manager as never);
      gesture.handlers.onTouchesMove?.({
        allTouches: [{ absoluteX: 92, absoluteY: 176 }] } as never, manager as never);
    });
    expect(manager.fail).not.toHaveBeenCalled();
    await act(async () => {
      gesture.handlers.onTouchesMove?.({
        allTouches: [{ absoluteX: 94, absoluteY: 175 }] } as never, manager as never);
    });
    expect(manager.fail).toHaveBeenCalledTimes(1);
  });

  it('lifts once, opens a destination, and persists a completed drag', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation();
    const database = await setupDb();
    const { first, middle, last } = await seedThree(database);
    const { onEdit } = await renderLibrary(database);
    const gesture = dragGesture(first.id);

    await beginDrag(gesture);

    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('routine-drop-slot')).toBeOnTheScreen();

    await act(async () => {
      gesture.handlers.onUpdate?.({
        absoluteX: 87,
        absoluteY: 364,
        translationX: 0,
        translationY: 204,
        velocityX: 0,
        velocityY: 520,
      } as never);
      gesture.handlers.onEnd?.({} as never, true);
      gesture.handlers.onFinalize?.({} as never, true);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(async () => {
      expect((await listChecklists(database)).map(({ id }) => id)).toEqual([
        middle.id,
        last.id,
        first.id,
      ]);
    });
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('moves a routine through TalkBack actions and announces its position', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation();
    const database = await setupDb();
    const { first, middle, last } = await seedThree(database);
    await renderLibrary(database);

    expect(screen.getByTestId(`routine-card-action-${middle.id}`).props.accessibilityActions).toEqual([
      { name: 'move-earlier', label: 'Move earlier' },
      { name: 'move-later', label: 'Move later' },
    ]);

    fireEvent(
      screen.getByTestId(`routine-card-action-${first.id}`),
      'accessibilityAction',
      { nativeEvent: { actionName: 'move-later' } },
    );

    await waitFor(async () => {
      expect((await listChecklists(database)).map(({ id }) => id)).toEqual([
        middle.id,
        first.id,
        last.id,
      ]);
    });
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(/2 of 3/i));
  });

  it('keeps the persisted order when Android cancels a displaced drag', async () => {
    jest.spyOn(Vibration, 'vibrate').mockImplementation();
    const database = await setupDb();
    const { first, middle, last } = await seedThree(database);
    const { onEdit } = await renderLibrary(database);
    const gesture = dragGesture(first.id);
    await beginDrag(gesture);

    await act(async () => {
      gesture.handlers.onUpdate?.({
        absoluteX: 87,
        absoluteY: 364,
        translationX: 0,
        translationY: 204,
        velocityX: 0,
        velocityY: 520,
      } as never);
      gesture.handlers.onEnd?.({} as never, false);
      gesture.handlers.onFinalize?.({} as never, false);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('routine-drop-slot')).toBeNull();
    });
    expect((await listChecklists(database)).map(({ id }) => id)).toEqual([
      first.id, middle.id, last.id,
    ]);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('restores the persisted order and reports a failed reorder', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const database = await setupDb();
    const { first, middle, last } = await seedThree(database);
    const failingDatabase: Database = {
      ...database,
      async runAsync(sql, ...params) {
        if (sql.startsWith('UPDATE checklists SET library_position')) {
          throw new Error('simulated reorder failure');
        }
        return database.runAsync(sql, ...params);
      },
    };
    await renderLibrary(failingDatabase);

    fireEvent(
      screen.getByTestId(`routine-card-action-${first.id}`),
      'accessibilityAction',
      { nativeEvent: { actionName: 'move-later' } },
    );

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith(
        expect.stringMatching(/save order/i),
        expect.any(String),
      );
    });
    expect((await listChecklists(database)).map(({ id }) => id)).toEqual([
      first.id,
      middle.id,
      last.id,
    ]);
    expect(
      screen
        .getAllByRole('button', { name: /^Edit / })
        .map((button) => button.props.accessibilityLabel),
    ).toEqual(['Edit First', 'Edit Middle', 'Edit Last']);
  });

  it('cancels an active drag when Android Back is pressed', async () => {
    let backHandler: (() => boolean | null | undefined) | undefined;
    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        backHandler = handler;
        return { remove: jest.fn() };
      });
    jest.spyOn(Vibration, 'vibrate').mockImplementation();
    const database = await setupDb();
    const { first, middle, last } = await seedThree(database);
    await renderLibrary(database);
    const gesture = dragGesture(first.id);
    await beginDrag(gesture);

    let handled = false;
    await act(async () => {
      handled = backHandler?.() ?? false;
      await Promise.resolve();
    });
    expect(handled).toBe(true);

    await waitFor(() => {
      expect(screen.queryByTestId('routine-drop-slot')).toBeNull();
    });
    expect((await listChecklists(database)).map(({ id }) => id)).toEqual([
      first.id,
      middle.id,
      last.id,
    ]);
  });
});
