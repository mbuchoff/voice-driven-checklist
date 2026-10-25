import { act, fireEvent, screen } from '@testing-library/react-native';
import { type GestureType } from 'react-native-gesture-handler';

import { runMigrations } from '@/src/db/migrations';
import { createTestDatabase } from '@/src/test/createTestDatabase';

import type { EditorMode } from './RoutineEditor';
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

export async function cancelRowDrag(gesture: GestureType) {
  await act(async () => {
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
