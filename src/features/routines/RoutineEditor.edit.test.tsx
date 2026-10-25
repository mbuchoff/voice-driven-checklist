import { Profiler } from 'react';
import {
  act,
  fireEvent,
  screen,
} from '@testing-library/react-native';
import { Keyboard, ScrollView, StyleSheet, Vibration } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { renderWithDatabase } from '@/src/test/renderWithDatabase';

import { RoutineEditor } from './RoutineEditor';
import { STEP_MAKE_ROOM, STEP_REORDER_SETTLE_MS } from './useStepReorder';
import {
  beginRowDrag,
  cancelRowDrag,
  dragRow,
  finishRowDrag,
  flushGestureCommit,
  getByGestureTestId,
  primeRowLayouts,
  releaseRowDrag,
  rowGesture,
  setupEditorDatabase as setupDb,
  tapToEdit,
} from './RoutineEditor.testSupport';
import { createRoutine, getRoutine } from './repository';

function deleteStepByAccessibility(index: number) {
  fireEvent(screen.getByTestId(`step-label-${index}`), 'accessibilityAction', {
    nativeEvent: { actionName: 'delete' },
  });
}

describe('RoutineEditor', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  describe('edit mode', () => {
    it('reveals a tapped existing step instead of scrolling to the routine end', async () => {
      jest
        .spyOn(global, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          callback(0);
          return 1;
        });
      const scrollTo = jest
        .spyOn(ScrollView.prototype, 'scrollTo')
        .mockImplementation(jest.fn());
      const scrollToEnd = jest
        .spyOn(ScrollView.prototype, 'scrollToEnd')
        .mockImplementation(jest.fn());
      const keyboardListener = jest.spyOn(Keyboard, 'addListener');
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'keep the selected row visible',
        steps: Array.from({ length: 8 }, (_, index) => ({
          text: `step ${index + 1}`,
        })),
      });
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );
      fireEvent(screen.getByTestId('routine-editor-scroll'), 'layout', {
        nativeEvent: {
          layout: { x: 0, y: 84, width: 360, height: 500 },
        },
      });

      // Step 7 sits 336–392 dp down the list.
      fireEvent(screen.getByTestId('step-row-6'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 336, width: 360, height: 56 } },
      });

      tapToEdit(6);
      const keyboardShown = keyboardListener.mock.calls
        .filter(([event]) => event === 'keyboardDidShow')
        .at(-1);
      expect(keyboardShown).toBeDefined();
      act(() => {
        keyboardShown?.[1]({ endCoordinates: { screenY: 400 } } as never);
      });

      // 316 dp of list show above the keyboard (400 − 84), so the step's
      // bottom plus 24 dp (392 + 24) needs the list scrolled by 100.
      expect(scrollTo).toHaveBeenCalledWith({ y: 100, animated: true });
      expect(scrollToEnd).not.toHaveBeenCalled();
    });

    it('says beside "Steps" that holding a step moves it', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, { title: 'hint', steps: [{ text: 'a' }] });
      await renderWithDatabase(
        <RoutineEditor initialRoutine={existing} onSaved={jest.fn()} onCancel={jest.fn()} />,
        { database },
      );

      expect(screen.getByText(/hold to move/)).toBeOnTheScreen();
    });

    it('persists items reordered by holding and dragging a row', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'reorder me',
        steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      const onSaved = jest.fn();
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={onSaved}
          onCancel={jest.fn()}
        />,
        { database },
      );

      primeRowLayouts([50, 50, 50]);
      await dragRow(0, 25, 125);
      fireEvent.press(screen.getByTestId('save'));

      await screen.findByTestId('save');
      const reloaded = await getRoutine(database, existing.id);
      expect(reloaded?.steps.map((i) => i.text)).toEqual(['b', 'c', 'a']);
    });

    describe('the steps a dragged step passes', () => {
      async function threeSteps() {
        const database = await setupDb();
        const existing = await createRoutine(database, {
          title: 'make room',
          steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
        });
        await renderWithDatabase(
          <RoutineEditor initialRoutine={existing} onSaved={jest.fn()} onCancel={jest.fn()} />,
          { database },
        );
        primeRowLayouts([50, 50, 50]);
      }
      const glide = (testID: string) => screen.getByTestId(testID).props.layout;

      it('glide out of its way with the drag’s spring, its slot too, but not the dragged step', async () => {
        await threeSteps();

        const gesture = await beginRowDrag(0, 25, 125);

        expect(glide('step-row-1')).toBeDefined();
        expect(glide('step-row-1')).toBe(STEP_MAKE_ROOM);
        expect(glide('step-row-2')).toBe(STEP_MAKE_ROOM);
        expect(glide('step-drop-target-2')).toBe(STEP_MAKE_ROOM);
        // Otherwise it would fly to where it lands.
        expect(glide('step-row-0')).toBeUndefined();
        await cancelRowDrag(gesture);
      });

      it('move without gliding once the drop has landed', async () => {
        await threeSteps();
        const gesture = await beginRowDrag(0, 25, 125);

        await finishRowDrag(gesture);

        expect(['step-label-0', 'step-label-1', 'step-label-2'].map((id) => screen.getByTestId(id).props.children)).toEqual(['b', 'c', 'a']);
        expect([0, 1, 2].map((index) => glide(`step-row-${index}`))).toEqual([undefined, undefined, undefined]);
      });
    });

    it('shows a floating preview and insertion target while dragging', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'preview me',
        steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      primeRowLayouts([50, 50, 50]);
      const gesture = await beginRowDrag(0, 25, 25);

      expect(screen.getByTestId('step-drag-preview')).toBeOnTheScreen();
      expect(screen.getByTestId('step-drag-preview-text').props.children).toBe('a');
      expect(screen.getByTestId('step-drop-target-0')).toBeOnTheScreen();
      expect(
        StyleSheet.flatten(screen.getByTestId('step-drop-target-0').props.style)
          .height,
      ).toBe(50);
      // The held step is unseen; its slot stands in for it.
      expect(
        StyleSheet.flatten(screen.getByTestId('step-row-0').props.style)
          .opacity,
      ).toBe(0);

      await finishRowDrag(gesture);

      expect(screen.queryByTestId('step-drag-preview')).toBeNull();
      expect(screen.getByTestId('step-row-2')).toBeOnTheScreen();
    });

    it('replaces the gap with reordered rows without remounting displaced rows', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'settle smoothly',
        steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      primeRowLayouts([50, 50, 50]);
      const gesture = await beginRowDrag(0, 25, 125);
      const firstDisplacedRow = screen.getByTestId('step-row-1');
      const secondDisplacedRow = screen.getByTestId('step-row-2');

      await releaseRowDrag(gesture);

      expect(screen.getByTestId('step-label-2')).toHaveTextContent('a');
      expect(
        StyleSheet.flatten(screen.getByTestId('step-row-2').props.style)
          .opacity,
      ).toBe(1);
      expect(screen.getByTestId('step-row-0')).toBe(firstDisplacedRow);
      expect(screen.getByTestId('step-row-1')).toBe(secondDisplacedRow);
      expect(screen.queryByTestId('step-drop-target-2')).toBeNull();
    });

    it('keeps the settling preview mounted until its release animation finishes', async () => {
      const releaseCallbacks: ((finished?: boolean) => void)[] = [];
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'finish the release',
        steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );
      primeRowLayouts([50, 50, 50]);

      const gesture = await beginRowDrag(0, 25, 125);
      jest.spyOn(Reanimated, 'withTiming').mockImplementation(
        ((value, _config, callback) => {
          if (callback) releaseCallbacks.push(callback);
          return value;
        }) as typeof Reanimated.withTiming,
      );
      jest.useFakeTimers();
      await releaseRowDrag(gesture);
      expect(screen.getByTestId('step-drag-preview')).toBeOnTheScreen();

      act(() => jest.advanceTimersByTime(10_000));
      expect(screen.getByTestId('step-drag-preview')).toBeOnTheScreen();

      jest.useRealTimers();
      await act(async () => {
        releaseCallbacks.at(-1)?.(true);
        await flushGestureCommit();
      });
      expect(screen.queryByTestId('step-drag-preview')).toBeNull();
    });

    it('moves the real insertion target while keeping the preview coordinate base fixed', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'smooth targets',
        steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      primeRowLayouts([50, 50, 50]);

      const gesture = await beginRowDrag(0, 25, 125);
      const previewTop = () =>
        StyleSheet.flatten(screen.getByTestId('step-drag-preview').props.style)
          .top;
      expect(previewTop()).toBe(0);
      expect(screen.getByTestId('step-drop-target-2')).toBeOnTheScreen();

      act(() => {
        gesture.handlers.onUpdate?.({ absoluteY: 125 } as never);
      });
      await act(async () => {
        await flushGestureCommit();
      });
      expect(screen.getByTestId('step-drop-target-2')).toBeOnTheScreen();
      expect(previewTop()).toBe(0);

      await cancelRowDrag(gesture);
    });

    it('does not rerender again while the pointer stays in one insertion slot', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'smooth drag',
        steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      const onRender = jest.fn();
      await renderWithDatabase(
        <Profiler id="editor" onRender={onRender}>
          <RoutineEditor
            initialRoutine={existing}
            onSaved={jest.fn()}
            onCancel={jest.fn()}
          />
        </Profiler>,
        { database },
      );

      primeRowLayouts([50, 50, 50]);

      const gesture = await beginRowDrag(0, 25, 125);
      onRender.mockClear();
      act(() => {
        gesture.handlers.onUpdate?.({ absoluteY: 130 } as never);
      });
      await act(async () => {
        await flushGestureCommit();
      });
      expect(onRender).not.toHaveBeenCalled();
      await cancelRowDrag(gesture);
    });

    it('ignores a second row gesture while another row is being dragged', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'one drag at a time',
        steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );
      primeRowLayouts([50, 50, 50]);

      const firstGesture = await beginRowDrag(0, 25, 125);
      const secondGesture = rowGesture(1);
      await act(async () => {
        secondGesture.handlers.onStart?.({ absoluteY: 75 } as never);
        secondGesture.handlers.onUpdate?.({ absoluteY: 20 } as never);
        secondGesture.handlers.onEnd?.({} as never, true);
        secondGesture.handlers.onFinalize?.({} as never, true);
        await flushGestureCommit();
      });

      expect(screen.getByTestId('step-drag-preview-text').props.children).toBe('a');
      expect(screen.getByTestId('step-label-0')).toHaveTextContent('a');

      await releaseRowDrag(firstGesture);
      expect(screen.getByTestId('step-label-2')).toHaveTextContent('a');
    });

    it('allows another drag when the claimed row disappears before drag setup', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'recover a claimed drag',
        steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );
      primeRowLayouts([50, 50, 50]);

      const removedRowGesture = rowGesture(0);
      act(() => {
        removedRowGesture.handlers.onStart?.({ absoluteY: 25 } as never);
        deleteStepByAccessibility(0);
        removedRowGesture.handlers.onFinalize?.({} as never, false);
      });
      await act(async () => {
        await flushGestureCommit();
      });

      primeRowLayouts([50, 50]);
      await beginRowDrag(0, 25, 25);

      expect(screen.getByTestId('step-drag-preview-text').props.children).toBe('b');
    });

    it('keeps a successful release claimed until its JS setup begins', async () => {
      const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation();
      vibrate.mockClear();
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'serialize releases',
        steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );
      primeRowLayouts([50, 50, 50]);

      const firstGesture = await beginRowDrag(0, 25, 125);
      const secondGesture = rowGesture(1);
      jest.useFakeTimers();
      act(() => {
        firstGesture.handlers.onEnd?.({} as never, true);
        firstGesture.handlers.onFinalize?.({} as never, true);
        secondGesture.handlers.onStart?.({ absoluteY: 75 } as never);
        jest.runAllTicks();
      });

      // One pick-up (the second hold is refused); the other tick is the
      // first step passing another.
      expect(vibrate.mock.calls.filter(([ms]) => ms === 12)).toHaveLength(1);
    });

    describe('a drag that closes the open step or clears UNDO rows as it starts', () => {
      async function fourSteps() {
        const database = await setupDb();
        const existing = await createRoutine(database, {
          title: 'reshape then drag',
          steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }],
        });
        await renderWithDatabase(
          <RoutineEditor initialRoutine={existing} onSaved={jest.fn()} onCancel={jest.fn()} />,
          { database },
        );
      }
      /** The rows' places once the list has closed up. */
      function layOut(rows: [index: number, y: number][]) {
        for (const [index, y] of rows) {
          fireEvent(screen.getByTestId(`step-row-${index}`), 'layout', {
            nativeEvent: { layout: { y, height: 50 } },
          });
        }
      }
      const labels = () => [0, 1, 2, 3].map((index) => screen.getByTestId(`step-label-${index}`).props.children);

      it('aims at where the steps are once the open step has closed', async () => {
        await fourSteps();
        tapToEdit(0);
        // Step 1 is open, with its times under its words.
        primeRowLayouts([110, 50, 50, 50]);
        // Gesture work reaches JS in microtasks; only the clock is faked.
        jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });

        // Step 4 lifts; step 1 closes and the steps below it move up 60.
        const gesture = await beginRowDrag(3, 235, 235);
        layOut([[0, 0], [1, 50], [2, 100]]);
        await act(async () => {
          jest.advanceTimersByTime(STEP_REORDER_SETTLE_MS);
        });
        // The finger rises 150, to the upper half of step 3 as it is now.
        await act(async () => {
          gesture.handlers.onUpdate?.({ absoluteY: 85 } as never);
          await flushGestureCommit();
        });
        await finishRowDrag(gesture);

        expect(labels()).toEqual(['a', 'b', 'd', 'c']);
      });

      it('aims at where the steps are once the UNDO rows have gone', async () => {
        await fourSteps();
        primeRowLayouts([50, 50, 50, 50]);
        deleteStepByAccessibility(0);
        // The renumbered steps' gestures register in a microtask.
        await act(flushGestureCommit);
        // "Step deleted · UNDO" holds step 1's place above the others.
        layOut([[0, 50], [1, 100], [2, 150]]);
        // Gesture work reaches JS in microtasks; only the clock is faked.
        jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });

        // Step "d" lifts; the UNDO row goes and the steps move up 50.
        const gesture = await beginRowDrag(2, 175, 175);
        layOut([[0, 0], [1, 50]]);
        await act(async () => {
          jest.advanceTimersByTime(STEP_REORDER_SETTLE_MS);
        });
        // The finger rises 110, to the upper half of "b" as it is now.
        await act(async () => {
          gesture.handlers.onUpdate?.({ absoluteY: 65 } as never);
          await flushGestureCommit();
        });
        await finishRowDrag(gesture);

        expect([0, 1, 2].map((index) => screen.getByTestId(`step-label-${index}`).props.children)).toEqual(['b', 'd', 'c']);
      });
    });

    it('forgets deleted row measurements before calculating the bottom slot', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'delete then drag',
        steps: [
          { text: 'a' },
          { text: 'b' },
          { text: 'c' },
          { text: 'd' },
        ],
      });
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );
      primeRowLayouts([50, 50, 50, 50]);
      deleteStepByAccessibility(3);
      jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });

      // Lifting clears the UNDO row; the drop aims once the list has settled.
      const gesture = await beginRowDrag(0, 25, 25);
      await act(async () => {
        jest.advanceTimersByTime(STEP_REORDER_SETTLE_MS);
      });
      await act(async () => {
        gesture.handlers.onUpdate?.({ absoluteY: 180 } as never);
        await flushGestureCommit();
      });

      expect(screen.getByTestId('step-drop-target-2')).toBeOnTheScreen();
      await cancelRowDrag(gesture);
    });

    it('starts a second drag from the item current row after reordering', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'drag again',
        steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      primeRowLayouts([50, 50, 50]);
      await dragRow(2, 125, 20);

      expect(screen.getByTestId('step-label-0')).toHaveTextContent('c');

      await beginRowDrag(0, 25, 25);

      expect(
        StyleSheet.flatten(screen.getByTestId('step-drag-preview').props.style)
          .top,
      ).toBe(0);
      expect(screen.getByTestId('step-drag-preview-text').props.children).toBe('c');
    });

    it('does not reuse temporary drop-gap layouts on later drags', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'drag cleanly',
        steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      primeRowLayouts([50, 50, 50]);
      await dragRow(2, 125, 20);

      await dragRow(0, 25, 125);

      expect(screen.getByTestId('step-label-2')).toHaveTextContent('c');

      await beginRowDrag(2, 125, 125);

      expect(
        StyleSheet.flatten(screen.getByTestId('step-drag-preview').props.style)
          .top,
      ).toBe(100);
    });

    it('autoscrolls when the pointer is near the visible scroll edge below the header', async () => {
      const frames: FrameRequestCallback[] = [];
      jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
      const scrollTo = jest
        .spyOn(ScrollView.prototype, 'scrollTo')
        .mockImplementation(jest.fn());
      // React Native's Jest setup makes scrollTo a mock already, so spying on
      // it returns that shared mock, calls from earlier tests and all.
      scrollTo.mockClear();
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'scroll me',
        steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      fireEvent(screen.getByTestId('routine-editor-scroll'), 'layout', {
        nativeEvent: { layout: { y: 64, height: 300 } },
      });
      fireEvent(screen.getByTestId('routine-editor-scroll'), 'contentSizeChange', 0, 1000);
      primeRowLayouts([50, 50, 50]);

      await beginRowDrag(2, 289, 340);
      act(() => frames.shift()?.(0));
      act(() => frames.shift()?.(16));

      expect(scrollTo).toHaveBeenCalledTimes(1);
      const scrollOptions = scrollTo.mock.calls[0]?.[0] as { y: number };
      expect(scrollOptions.y).toBeGreaterThan(0);
      expect(scrollOptions.y).toBeLessThan(16);
      scrollTo.mockRestore();
    });

    it('keeps autoscrolling while a held row remains at the visible edge', async () => {
      const frames: FrameRequestCallback[] = [];
      jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
      const scrollTo = jest
        .spyOn(ScrollView.prototype, 'scrollTo')
        .mockImplementation(jest.fn());
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'keep scrolling',
        steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );
      fireEvent(screen.getByTestId('routine-editor-scroll'), 'layout', {
        nativeEvent: { layout: { y: 0, height: 300 } },
      });
      fireEvent(
        screen.getByTestId('routine-editor-scroll'),
        'contentSizeChange',
        0,
        1000,
      );
      fireEvent(screen.getByTestId('step-row-0'), 'layout', {
        nativeEvent: { layout: { y: 0, height: 50 } },
      });

      const gesture = await beginRowDrag(0, 25, 290);
      const callsAfterPointerUpdate = scrollTo.mock.calls.length;
      expect(frames).toHaveLength(1);

      act(() => frames.shift()?.(16));
      act(() => frames.shift()?.(32));
      act(() => frames.shift()?.(48));
      expect(scrollTo).toHaveBeenCalledTimes(callsAfterPointerUpdate + 2);

      await finishRowDrag(gesture);
      const callsAfterDrop = scrollTo.mock.calls.length;
      act(() => frames.shift()?.(48));
      expect(scrollTo).toHaveBeenCalledTimes(callsAfterDrop);
    });

    it('updates the drop target after autoscroll before release', async () => {
      const frames: FrameRequestCallback[] = [];
      jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
      jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(jest.fn());
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'scroll target',
        steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      fireEvent(screen.getByTestId('routine-editor-scroll'), 'layout', {
        nativeEvent: { layout: { y: 0, height: 300 } },
      });
      fireEvent(screen.getByTestId('routine-editor-scroll'), 'contentSizeChange', 0, 1000);
      fireEvent(screen.getByTestId('step-row-0'), 'layout', {
        nativeEvent: { layout: { y: 0, height: 50 } },
      });
      fireEvent(screen.getByTestId('step-row-1'), 'layout', {
        nativeEvent: { layout: { y: 300, height: 20 } },
      });
      fireEvent(screen.getByTestId('step-row-2'), 'layout', {
        nativeEvent: { layout: { y: 650, height: 50 } },
      });

      const gesture = await beginRowDrag(0, 25, 290);
      for (const timestamp of [0, 16, 32, 48, 64, 80]) {
        act(() => frames.shift()?.(timestamp));
      }
      await finishRowDrag(gesture);

      expect(screen.getByTestId('step-label-1')).toHaveTextContent('a');
      jest.restoreAllMocks();
    });

    it('cancels a drag when the responder is terminated', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'cancel drag',
        steps: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      await renderWithDatabase(
        <RoutineEditor
          initialRoutine={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      primeRowLayouts([50, 50, 50]);
      const gesture = await beginRowDrag(0, 25, 125);
      await cancelRowDrag(gesture);

      expect(screen.getByTestId('step-label-0')).toHaveTextContent('a');
      expect(screen.queryByTestId('step-drag-preview')).toBeNull();
    });

    it('lifts a held step, but lets a finger that drifts more than 12 dp scroll instead', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'keep drag',
        steps: [{ text: 'a' }, { text: 'b' }],
      });
      await renderWithDatabase(
        <RoutineEditor initialRoutine={existing} onSaved={jest.fn()} onCancel={jest.fn()} />,
        { database },
      );
      fireEvent(screen.getByTestId('step-row-0'), 'layout', {
        nativeEvent: { layout: { y: 0, height: 50 } },
      });
      const localId = screen.getByTestId('step-row-0').props.nativeID;
      const gesture = getByGestureTestId(`step-hold-gesture-${localId}-0`);
      const touch = (x: number, y: number) =>
        ({ numberOfTouches: 1, allTouches: [{ absoluteX: x, absoluteY: y }] }) as never;

      const drifting = { activate: jest.fn(), fail: jest.fn() };
      act(() => {
        gesture.handlers.onTouchesDown?.(touch(100, 25), drifting as never);
        gesture.handlers.onTouchesMove?.(touch(112, 37), drifting as never);
      });
      expect(drifting.fail).not.toHaveBeenCalled();
      act(() => {
        gesture.handlers.onTouchesMove?.(touch(100, 38), drifting as never);
      });
      expect(drifting.fail).toHaveBeenCalledTimes(1);

      expect(screen.getByTestId('routine-editor-scroll').props.scrollEnabled).toBe(true);
      await beginRowDrag(0, 25, 25);
      expect(screen.getByTestId('step-drag-preview')).toBeOnTheScreen();
      expect(screen.getByTestId('routine-editor-scroll').props.scrollEnabled).toBe(false);
      await finishRowDrag(gesture);
    });

    it('opens a step for typing after a quick tap, and closes it when it loses focus', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'keep drag',
        steps: [{ text: 'hold this text' }],
      });
      await renderWithDatabase(
        <RoutineEditor initialRoutine={existing} onSaved={jest.fn()} onCancel={jest.fn()} />,
        { database },
      );
      expect(screen.queryByTestId('step-text-0')).toBeNull();

      const localId = screen.getByTestId('step-row-0').props.nativeID;
      const editGesture = getByGestureTestId(`step-edit-gesture-${localId}-0`);
      expect(editGesture.config.maxDurationMs).toBeLessThan(350);
      act(() => {
        editGesture.handlers.onEnd?.({} as never, true);
      });
      expect(screen.getByTestId('step-text-0').props.value).toBe('hold this text');

      await act(async () => {
        fireEvent(screen.getByTestId('step-text-0'), 'blur');
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(screen.queryByTestId('step-text-0')).toBeNull();
      expect(screen.getByTestId('step-label-0')).toHaveTextContent('hold this text');
    });
  });
});
