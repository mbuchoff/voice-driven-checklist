import { act, fireEvent, screen } from '@testing-library/react-native';
import { type GestureType } from 'react-native-gesture-handler';

import type { Database } from '@/src/db/database';
import { runMigrations } from '@/src/db/migrations';
import type { MemoryDevicePreferenceStore } from '@/src/features/settings/preferences';
import { createTestDatabase } from '@/src/test/createTestDatabase';
import { renderWithDatabase } from '@/src/test/renderWithDatabase';

import { RoutineEditor, type EditorMode } from './RoutineEditor';
import { createRoutine } from './repository';
import type { RoutineColorKey } from './routineColors';
import type { Routine } from './types';

export const { getByGestureTestId } = jest.requireActual(
  'react-native-gesture-handler/lib/commonjs/jestUtils',
) as typeof import('react-native-gesture-handler/lib/typescript/jestUtils');

/** Editing a saved routine, with its delete and run callbacks stubbed. */
export function editing(routine: Routine): EditorMode {
  return { kind: 'edit', routine, onDeleted: jest.fn(), onRun: jest.fn() };
}

export async function setupEditorDatabase() {
  const database = createTestDatabase();
  await runMigrations(database);
  return database;
}

export async function flushGestureCommit() {
  await Promise.resolve();
  await Promise.resolve();
}

export async function dragRow(
  index: number,
  startY: number,
  endY: number,
) {
  const gesture = await beginRowDrag(index, startY, endY);
  await finishRowDrag(gesture);
}

export async function beginRowDrag(
  index: number,
  startY: number,
  currentY: number,
): Promise<GestureType> {
  let gesture = rowGesture(index);
  await act(async () => {
    gesture.handlers.onStart?.({ absoluteY: startY } as never);
    await Promise.resolve();
  });
  gesture = rowGesture(index);
  await act(async () => {
    gesture.handlers.onUpdate?.({ absoluteY: currentY } as never);
    await flushGestureCommit();
  });
  return gesture;
}

export function rowGesture(index: number) {
  const localId = screen.getByTestId(`step-row-${index}`).props.nativeID;
  return getByGestureTestId(`step-hold-gesture-${localId}-${index}`);
}

export async function releaseRowDrag(gesture: GestureType) {
  await act(async () => {
    gesture.handlers.onEnd?.({} as never, true);
    gesture.handlers.onFinalize?.({} as never, true);
    await Promise.resolve();
  });
}

export async function finishRowDrag(gesture: GestureType) {
  await releaseRowDrag(gesture);
}

/** A cancelled drag, in RNGH's order: an unsuccessful end, then finalize. */
export async function cancelRowDrag(gesture: GestureType) {
  await act(async () => {
    gesture.handlers.onEnd?.({} as never, false);
    gesture.handlers.onFinalize?.({} as never, false);
    await Promise.resolve();
  });
}

export function tapToEdit(index: number) {
  const localId = screen.getByTestId(`step-row-${index}`).props.nativeID;
  const gesture = getByGestureTestId(`step-edit-gesture-${localId}-${index}`);
  act(() => {
    gesture.handlers.onEnd?.({} as never, true);
  });
}

export function primeRowLayouts(heights: number[], gap = 0) {
  let y = 0;
  heights.forEach((height, index) => {
    fireEvent(screen.getByTestId(`step-row-${index}`), 'layout', {
      nativeEvent: { layout: { y, height } },
    });
    y += height + gap;
  });
}

export async function renderEditor(
  { initialRoutine, newColorKey = 'teal-1' }: { initialRoutine?: Routine; newColorKey?: RoutineColorKey } = {},
  options: { database?: Database; preferences?: MemoryDevicePreferenceStore } = {},
) {
  const database = options.database ?? (await setupEditorDatabase());
  const callbacks = {
    onSaved: jest.fn(),
    onCancel: jest.fn(),
    onDeleted: jest.fn(),
    onRun: jest.fn(),
  };
  const editor = () => (
    <RoutineEditor
      mode={initialRoutine
        ? { kind: 'edit', routine: initialRoutine, onDeleted: callbacks.onDeleted, onRun: callbacks.onRun }
        : { kind: 'new', colorKey: newColorKey }}
      onSaved={callbacks.onSaved}
      onCancel={callbacks.onCancel}
    />
  );
  const view = await renderWithDatabase(editor(), { database, preferences: options.preferences });
  // Jest's Reanimated stand-in reads an animated style when its view renders.
  const renderAgain = () => view.rerender(editor());
  return { database, ...callbacks, renderAgain };
}

/** A saved routine to edit: two steps, the first timed. */
export async function existing(database: Database, overrides: Partial<Parameters<typeof createRoutine>[1]> = {}) {
  return createRoutine(database, {
    title: 'Morning stretch',
    colorKey: 'green-2',
    steps: [
      { text: 'Neck rolls', timerSeconds: 30 },
      { text: 'Breathe', timerSeconds: null },
    ],
    ...overrides,
  });
}

// The views that measure chips are hidden from accessibility on purpose.
export const HIDDEN = { includeHiddenElements: true };

/**
 * Jest doesn't lay out views: give the steps' rows a width (the chips' room
 * follows from it) and the chips their sizes.
 */
export function layOutChips(index: number, times: number[], chipWidth = 40, room = 330, noTimerWidth = chipWidth) {
  // The strip's room is the row's width less 16 of padding and its 10 inset.
  fireEvent(screen.getByTestId(`step-row-${index}`), 'layout', {
    nativeEvent: { layout: { x: 0, y: index * 56, width: room + 26, height: 56 } },
  });
  const widths: [string, number][] = [...times.map((time) => [String(time), chipWidth] as [string, number]), ['none', noTimerWidth]];
  for (const [chip, width] of widths) {
    fireEvent(screen.getByTestId(`chip-measure-${chip}`, HIDDEN), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height: 36 } },
    });
  }
}

export function layOutPanelChips(times: number[]) {
  fireEvent(screen.getByTestId('panel-chips-room', HIDDEN), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 370, height: 62 } },
  });
  for (const time of times) {
    fireEvent(screen.getByTestId(`panel-chip-measure-${time}`, HIDDEN), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 60, height: 44 } },
    });
  }
}
