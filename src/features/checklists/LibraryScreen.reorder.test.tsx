import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  StyleSheet,
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
import * as DragState from './useRoutineDragState';

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
  const props = { onCreate: jest.fn(), onEdit, onStart: jest.fn() };
  const view = await renderWithDatabase(
    <LibraryScreen {...props} />,
    { database },
  );
  await screen.findByTestId('routine-grid');
  fireEvent(screen.getByTestId('routine-grid'), 'layout', {
    nativeEvent: { layout: { width: 361, height: 396 } },
  });
  return { onEdit, onStart: props.onStart, rerenderLibrary: () => view.rerender(<LibraryScreen {...props} />) };
}

function delaySaves(database: Database) {
  let releaseSave!: () => void;
  const pendingSave = new Promise<void>(resolve => { releaseSave = resolve; });
  return {
    database: { ...database, async withTransactionAsync(action) {
      await pendingSave;
      return database.withTransactionAsync(action);
    } } satisfies Database,
    releaseSave,
  };
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

  it.each([
    { name: 'ordinary stationary Play tap', saving: false, delay: 500, moves: [], starts: true },
    { name: 'ordinary sideways Play swipe', saving: false, delay: 500, moves: [167], starts: false },
    { name: 'stationary Play tap during save', saving: true, delay: 500, moves: [], starts: true },
    { name: 'sideways Play swipe during save', saving: true, delay: 500, moves: [167], starts: false },
    { name: 'out-and-back Play swipe during save', saving: true, delay: 500, moves: [167, 137], starts: false },
    { name: 'Play contact in post-drop cooldown', saving: true, delay: 100, moves: [], starts: false },
  ])('$name', async ({ saving, delay, moves, starts }) => {
    const database = await setupDb();
    const { first } = await seedThree(database);
    const pending = delaySaves(database);
    const { onStart } = await renderLibrary(pending.database);
    jest.useFakeTimers();
    try {
      if (saving) {
        const gesture = dragGesture(first.id);
        await beginDrag(gesture);
        await act(async () => {
          gesture.handlers.onUpdate?.({ absoluteY: 364, translationX: 0,
            translationY: 204, velocityX: 0, velocityY: 200 } as never);
          gesture.handlers.onEnd?.({} as never, true);
          gesture.handlers.onFinalize?.({} as never, true);
        });
      }
      await act(async () => { jest.advanceTimersByTime(delay); });
      if (saving) expect(dragGesture(first.id).config.enabled).toBe(false);
      const button = screen.getByTestId(`start-${first.id}`);
      const host = { measure: (callback: (...args: number[]) => void) => callback(0, 0, 46, 46, 114, 316) };
      const event = (x: number) => ({ currentTarget: host, persist() {},
        nativeEvent: { pageX: x, pageY: 339, touches: [{ pageX: x, pageY: 339 }] } });
      act(() => {
        fireEvent(button, 'touchStart', event(137));
        fireEvent(button, 'responderGrant', event(137));
        for (const x of moves) {
          fireEvent(button, 'touchMove', event(x));
          fireEvent(button, 'responderMove', event(x));
        }
        fireEvent(button, 'responderRelease', event(moves.at(-1) ?? 137));
      });
      expect(onStart).toHaveBeenCalledTimes(starts ? 1 : 0);
      if (starts) expect(onStart).toHaveBeenCalledWith(first.id);
    } finally {
      jest.useRealTimers();
      await act(async () => { pending.releaseSave(); });
    }
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

  it.each([0, 700])('does not select a card after a sideways swipe, even after waiting %i ms to release', async (releaseDelay) => {
    const timing = jest.spyOn(Animated, 'timing');
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation();
    const database = await setupDb();
    const { first, middle, last } = await seedThree(database);
    const { onEdit } = await renderLibrary(database);
    const gesture = dragGesture(first.id);
    const manager = { activate: jest.fn(), fail: jest.fn() };
    const card = screen.getByTestId(`routine-card-action-${first.id}`);
    const feedback = screen.UNSAFE_getAllByType(Animated.View)
      .find(node => node.props.testID === `routine-card-${first.id}`)!;
    const feedbackTransforms = StyleSheet.flatten(feedback.props.style).transform;
    const scale = feedbackTransforms.find((entry: { scale?: Animated.Value }) => entry.scale)?.scale;
    const translateY = feedbackTransforms.find((entry: { translateY?: Animated.Value }) => entry.translateY)?.translateY;
    expect(scale).toBeInstanceOf(Animated.Value);
    expect(translateY).toBeInstanceOf(Animated.Value);
    const host = { measure: (callback: (...args: number[]) => void) => callback(0, 0, 174.5, 192, 16, 180) };
    const responderEvent = (x: number) => ({
      currentTarget: host,
      persist() {},
      nativeEvent: { pageX: x, pageY: 240, touches: [{ pageX: x, pageY: 240 }] },
    });
    jest.useFakeTimers();
    act(() => {
      gesture.handlers.onBegin?.({} as never);
      gesture.handlers.onTouchesDown?.({ numberOfTouches: 1,
        allTouches: [{ absoluteX: 90, absoluteY: 240 }] } as never, manager as never);
      // Drive Pressability's real responder handlers, not a synthetic onPress.
      fireEvent(card, 'responderGrant', responderEvent(90));
      gesture.handlers.onTouchesMove?.({
        allTouches: [{ absoluteX: 130, absoluteY: 240 }] } as never, manager as never);
      fireEvent(card, 'responderMove', responderEvent(130));
      gesture.handlers.onFinalize?.({} as never, false);
      jest.advanceTimersByTime(releaseDelay);
      timing.mockClear();
      fireEvent(card, 'responderRelease', responderEvent(130));
    });
    // Native animation delivery is mocked. Inspect only this card's requested
    // transforms: a cancelled release may return to rest, but must not push in.
    for (const [value, config] of timing.mock.calls) {
      if (value === scale) expect(config.toValue).toBe(1);
      if (value === translateY) expect(config.toValue).toBe(0);
    }
    expect(manager.fail).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
    expect((await listChecklists(database)).map(({ id }) => id)).toEqual([first.id, middle.id, last.id]);

    // Android's separate accessibility click has no touch payload or new Pan
    // contact. Drive Pressability's real click handler after the rejected swipe.
    fireEvent(card, 'click', { currentTarget: host, target: host,
      nativeEvent: {}, stopPropagation() {} });
    expect(onEdit).toHaveBeenCalledTimes(1);

    act(() => {
      gesture.handlers.onBegin?.({} as never);
      gesture.handlers.onTouchesDown?.({ numberOfTouches: 1,
        allTouches: [{ absoluteX: 90, absoluteY: 240 }] } as never, manager as never);
      fireEvent(card, 'responderGrant', responderEvent(90));
      gesture.handlers.onFinalize?.({} as never, false);
      fireEvent(card, 'responderRelease', responderEvent(90));
    });
    expect(onEdit).toHaveBeenCalledWith(first.id);
    expect(onEdit).toHaveBeenCalledTimes(2);
  });

  it.each(['begin-first', 'down-first'])('keeps the first card hold owned when another card receives a second pointer (%s)', async (eventOrder) => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation();
    const database = await setupDb();
    const { first, middle, last } = await seedThree(database);
    await renderLibrary(database);
    const firstGesture = dragGesture(first.id);
    const secondGesture = dragGesture(middle.id);
    const firstManager = { activate: jest.fn(), fail: jest.fn() };
    const secondManager = { activate: jest.fn(), fail: jest.fn() };
    const contact = (gesture: GestureType, manager: typeof firstManager, x: number) => {
      const begin = () => gesture.handlers.onBegin?.({} as never);
      const down = () => gesture.handlers.onTouchesDown?.({ numberOfTouches: 1,
        allTouches: [{ absoluteX: x, absoluteY: 240 }] } as never, manager as never);
      if (eventOrder === 'begin-first') { begin(); down(); }
      else { down(); begin(); }
    };
    await act(async () => {
      contact(firstGesture, firstManager, 90);
      contact(secondGesture, secondManager, 275);
      secondGesture.handlers.onFinalize?.({} as never, false);
      firstGesture.handlers.onTouchesMove?.({
        allTouches: [{ absoluteX: 98, absoluteY: 248 }] } as never, firstManager as never);
    });
    expect(secondManager.fail).toHaveBeenCalledTimes(1);
    expect(firstManager.fail).not.toHaveBeenCalled();
    await act(async () => {
      firstGesture.handlers.onStart?.({ absoluteY: 240 } as never);
      firstGesture.handlers.onUpdate?.({ absoluteY: 444, translationX: 0,
        translationY: 204, velocityX: 0, velocityY: 200 } as never);
      firstGesture.handlers.onEnd?.({} as never, true);
      firstGesture.handlers.onFinalize?.({} as never, true);
    });
    expect(vibrate).toHaveBeenCalledTimes(1);
    await waitFor(async () => expect((await listChecklists(database)).map(({ id }) => id))
      .toEqual([middle.id, last.id, first.id]));
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

  it('tells TalkBack users to wait when another move is still saving', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();
    const database = await setupDb();
    const { first, middle, last } = await seedThree(database);
    const delayed = delaySaves(database);
    await renderLibrary(delayed.database);
    const moveLater = () => fireEvent(screen.getByTestId(`routine-card-action-${first.id}`),
      'accessibilityAction', { nativeEvent: { actionName: 'move-later' } });
    try {
      moveLater();
      moveLater();
      expect(announce).toHaveBeenCalledWith(expect.stringMatching(/saving.*try again/i));
    } finally {
      await act(async () => { delayed.releaseSave(); });
    }
    await waitFor(async () => expect((await listChecklists(database)).map(({ id }) => id))
      .toEqual([middle.id, first.id, last.id]));
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(/2 of 3/i));
  });

  it('resynchronizes a declined drop with the order already being saved', async () => {
    jest.spyOn(Vibration, 'vibrate').mockImplementation();
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();
    const database = await setupDb();
    const { first, middle, last } = await seedThree(database);
    const delayed = delaySaves(database);
    const { rerenderLibrary } = await renderLibrary(delayed.database);
    const pendingSlot = StyleSheet.flatten(screen.getByTestId(`routine-position-${middle.id}`).props.style).transform;
    const gesture = dragGesture(first.id);
    await beginDrag(gesture);
    try {
      await act(async () => {
        gesture.handlers.onUpdate?.({ absoluteY: 364, translationX: 0,
          translationY: 204, velocityX: 0, velocityY: 200 } as never);
      });
      fireEvent(screen.getByTestId(`routine-card-action-${first.id}`),
        'accessibilityAction', { nativeEvent: { actionName: 'move-later' } });
      // Exercise the parent's declined-drop response to an already queued native
      // completion. This does not simulate Android recognizer arbitration.
      await act(async () => {
        gesture.handlers.onEnd?.({} as never, true);
        gesture.handlers.onFinalize?.({} as never, true);
      });
      // The Jest style hook is not reactive to the grid effect's shared-value
      // writes. Re-render unchanged props only to observe the reconciled values.
      rerenderLibrary();
      const transform = StyleSheet.flatten(screen.getByTestId(`routine-position-${first.id}`).props.style).transform;
      // The declined drop keeps the first card in the pending second slot,
      // which the middle card occupied before either move.
      expect(transform).toEqual(pendingSlot);
    } finally {
      await act(async () => { delayed.releaseSave(); });
    }
    await waitFor(async () => expect((await listChecklists(database)).map(({ id }) => id))
      .toEqual([middle.id, first.id, last.id]));
  });

  it.each([
    { name: 'stationary tap', moves: [], selected: true },
    { name: 'tap while UI work is queued', moves: [], selected: true, deferUiWrite: true },
    { name: 'sideways swipe', moves: [[130, 240]], selected: false },
    { name: 'out-and-back swipe', moves: [[130, 240], [90, 240]], selected: false },
    { name: '20dp diagonal drift', moves: [[102, 256]], selected: true },
    { name: 'drift beyond 20dp', moves: [[104, 255]], selected: false },
    { name: 'swipe on another card', moves: [[130, 240]], selected: false, otherCard: true },
    { name: 'tap spanning save completion', moves: [], selected: true, finishSave: true },
    { name: 'swipe spanning save completion', moves: [[130, 240]], selected: false, finishSave: true },
  ])('handles $name during a slow reorder save', async ({ moves, selected, deferUiWrite, otherCard, finishSave }) => {
    jest.spyOn(Vibration, 'vibrate').mockImplementation();
    const useDragState = DragState.useRoutineDragState;
    let state!: DragState.RoutineDragState;
    jest.spyOn(DragState, 'useRoutineDragState').mockImplementation(items => {
      state = useDragState(items);
      return state;
    });
    const database = await setupDb();
    const { first, middle } = await seedThree(database);
    const delayed = delaySaves(database);
    const { onEdit } = await renderLibrary(delayed.database);
    const gesture = dragGesture(first.id);
    await beginDrag(gesture);
    jest.useFakeTimers();
    let restoreUiWrites = () => {};
    try {
      await act(async () => {
        gesture.handlers.onUpdate?.({ absoluteY: 364, translationX: 0,
          translationY: 204, velocityX: 0, velocityY: 200 } as never);
        gesture.handlers.onEnd?.({} as never, true);
        gesture.handlers.onFinalize?.({} as never, true);
      });
      await act(async () => { jest.advanceTimersByTime(500); });
      expect(dragGesture(first.id).config.enabled).toBe(false);
      if (deferUiWrite) {
        // Model native RN-to-UI writes waiting in the UI queue. Reads still see
        // the last UI-owned cancellation, unlike Reanimated's synchronous mock.
        const value = state.selectionCancelled.value;
        expect(value[first.id]).toBe(true);
        const descriptor = Object.getOwnPropertyDescriptor(state.selectionCancelled, 'value')!;
        Object.defineProperty(state.selectionCancelled, 'value', {
          configurable: true, get: () => value, set: () => {},
        });
        restoreUiWrites = () => Object.defineProperty(state.selectionCancelled, 'value', descriptor);
      }
      const target = otherCard ? middle : first;
      const card = screen.getByTestId(`routine-card-action-${target.id}`);
      const host = { measure: (callback: (...args: number[]) => void) => callback(0, 0, 174.5, 192, 16, 180) };
      const eventAt = (pageX: number, pageY: number) => ({ currentTarget: host, persist() {},
        nativeEvent: { pageX, pageY, touches: [{ pageX, pageY }] } });
      // Disabled RNGH handlers do not receive this new contact. Native View and
      // Pressability still deliver its touch start and responder sequence.
      fireEvent(card, 'touchStart', eventAt(90, 240));
      fireEvent(card, 'responderGrant', eventAt(90, 240));
      if (finishSave) {
        await act(async () => { delayed.releaseSave(); });
        await act(async () => { jest.advanceTimersByTime(32); });
        expect(dragGesture(first.id).config.enabled).toBe(true);
      }
      for (const [x, y] of moves) {
        fireEvent(card, 'touchMove', eventAt(x, y));
        fireEvent(card, 'responderMove', eventAt(x, y));
      }
      const [x, y] = moves.at(-1) ?? [90, 240];
      fireEvent(card, 'responderRelease', eventAt(x, y));
      if (selected) expect(onEdit).toHaveBeenCalledWith(target.id);
      else expect(onEdit).not.toHaveBeenCalled();
    } finally {
      restoreUiWrites();
      jest.useRealTimers();
      await act(async () => { delayed.releaseSave(); });
    }
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
    await database.execAsync(`
      CREATE TRIGGER reject_reorder BEFORE UPDATE OF library_position ON checklists
      BEGIN SELECT RAISE(ABORT, 'simulated reorder failure'); END;
    `);
    await renderLibrary(database);

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

  it('cancels on Android Back and rejects even a retained responder release', async () => {
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
    const { onEdit } = await renderLibrary(database);
    const gesture = dragGesture(first.id);
    const card = screen.getByTestId(`routine-card-action-${first.id}`);
    const host = { measure: (callback: (...args: number[]) => void) => callback(0, 0, 174.5, 192, 16, 180) };
    const event = { currentTarget: host, persist() {},
      nativeEvent: { pageX: 90, pageY: 240, touches: [{ pageX: 90, pageY: 240 }] } };
    jest.useFakeTimers();
    fireEvent(card, 'responderGrant', event);
    await beginDrag(gesture);
    act(() => jest.advanceTimersByTime(500));

    let handled = false;
    await act(async () => {
      handled = backHandler?.() ?? false;
      await Promise.resolve();
    });
    expect(handled).toBe(true);
    // A delayed JS delivery of this same contact's touch-start must not clear
    // cancellation already recorded by the enabled UI-thread recognizer.
    fireEvent(card, 'touchStart', event);
    fireEvent(card, 'responderRelease', event);
    expect(onEdit).not.toHaveBeenCalled();

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
