import { createRef } from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { BackHandler, ScrollView, StyleSheet, Vibration } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';
import * as Reanimated from 'react-native-reanimated';

import { light } from '@/src/theme/palette';

import { getRoutineGridMetrics, getRoutinePosition } from './routineGrid';
import { RoutineReorderGrid } from './RoutineReorderGrid';

const { getByGestureTestId } = jest.requireActual(
  'react-native-gesture-handler/lib/commonjs/jestUtils',
) as typeof import('react-native-gesture-handler/lib/typescript/jestUtils');

afterEach(() => jest.restoreAllMocks());

async function mountDrag(
  direction: 1 | -1 = 1,
  initialPointer = direction === 1 ? 480 : 120,
) {
  jest.spyOn(Vibration, 'vibrate').mockImplementation();
  jest.spyOn(Reanimated, 'measure').mockReturnValue({
    x: 0, y: 0, pageX: 0, pageY: 100, width: 361, height: 400,
  });
  // Keep release completion pending so endpoint assertions observe the held
  // animation, not the settled card's fallback slot. Native timing is the seam.
  jest.spyOn(Reanimated, 'withTiming').mockImplementation(value => value);
  const frames = jest.spyOn(Reanimated, 'useFrameCallback');
  const scrollTo = jest.spyOn(Reanimated, 'scrollTo');
  const back = jest.spyOn(BackHandler, 'addEventListener');
  const shared = (value: number) => ({ value } as Reanimated.SharedValue<number>);
  const initialOffset = direction === 1 ? 0 : 816;
  const observedScrollY = shared(initialOffset);
  const from = direction === 1 ? 2 : 8;
  const props = {
    orderRevision: 0,
    items: Array.from({ length: 17 }, (_, index) => ({
      id: `${index}`, title: `Routine ${index}`, items: [{ text: 'Step' }],
    })),
    layout: getRoutineGridMetrics(361, 17), theme: light,
    scrollRef: createRef<ScrollView>() as Reanimated.AnimatedRef<ScrollView>,
    scrollY: observedScrollY, viewportHeight: shared(400), contentHeight: shared(2000),
    enabled: true, onWidthChange: jest.fn(), onEdit: jest.fn(), onStart: jest.fn(),
    onReorder: jest.fn(), onMoveByAccessibility: jest.fn(),
  };
  const view = render(<RoutineReorderGrid {...props} />);
  const gesture = getByGestureTestId(`routine-hold-gesture-${from}`) as GestureType;
  const manager = { activate: jest.fn(), fail: jest.fn() };
  let previousTimestamp: number | null = null;
  const tick = (timestamp: number) => {
    frames.mock.calls.at(-1)![0]({
      timestamp,
      timeSincePreviousFrame: previousTimestamp === null ? null : timestamp - previousTimestamp,
      timeSinceFirstFrame: timestamp,
    });
    previousTimestamp = timestamp;
  };
  const start = () => {
    gesture.handlers.onBegin?.({} as never);
    gesture.handlers.onTouchesDown?.({ numberOfTouches: 1,
      allTouches: [{ absoluteX: 90, absoluteY: initialPointer }] } as never, manager as never);
    gesture.handlers.onStart?.({ absoluteY: initialPointer } as never);
  };
  const move = (pointerY: number) => {
    gesture.handlers.onTouchesMove?.({ allTouches: [{ absoluteX: 90, absoluteY: pointerY }] } as never, manager as never);
    gesture.handlers.onUpdate?.({ absoluteY: pointerY, translationX: 0,
      translationY: pointerY - initialPointer, velocityX: 0, velocityY: 0 } as never);
  };
  const release = () => {
    gesture.handlers.onEnd?.({} as never, true);
    gesture.handlers.onFinalize?.({} as never, true);
  };
  const cancel = () => back.mock.calls.findLast(([event]) => event === 'hardwareBackPress')![1]();
  const requestedOffsets = () => scrollTo.mock.calls.map(call => call[2]);
  await act(async () => {
    start();
    tick(0);
    move(initialPointer + direction * 16);
  });
  return { props, view, from, initialOffset, initialPointer, observedScrollY,
    tick, start, move, release, cancel, scrollTo, requestedOffsets };
}

it.each([1, -1] as const)('scrolls while dragging 80 dp from the viewport edge and stops on retreat (%s)', async direction => {
  const drag = await mountDrag(direction, 300);
  await act(async () => {
    drag.move(300);
    drag.tick(16);
  });
  expect(drag.scrollTo).not.toHaveBeenCalled();
  await act(async () => {
    // The measured viewport spans y=100..500. These locations are inside the
    // expanded activation zones, but still comfortably away from either edge.
    drag.move(direction === 1 ? 420 : 180);
    drag.tick(32);
  });
  expect(drag.scrollTo).toHaveBeenCalledTimes(1);
  const offset = drag.requestedOffsets()[0];
  expect(direction * (offset - drag.initialOffset)).toBeGreaterThan(0);
  await act(async () => {
    drag.move(300);
    drag.tick(48);
  });
  expect(drag.requestedOffsets()).toEqual([offset]);
});

it.each([1, -1] as const)('keeps an initial hold in the expanded zone still until moving farther toward the edge (%s)', async direction => {
  const start = direction === 1 ? 420 : 180;
  const drag = await mountDrag(direction, start);
  await act(async () => {
    drag.move(start);
    drag.tick(16);
  });
  expect(drag.scrollTo).not.toHaveBeenCalled();
  await act(async () => {
    drag.move(start + direction * 10);
    drag.tick(32);
  });
  expect(drag.scrollTo).toHaveBeenCalledTimes(1);
  expect(direction * (drag.requestedOffsets()[0] - drag.initialOffset)).toBeGreaterThan(0);
});

it.each([1, -1] as const)('does not let delayed native reports reverse an edge drag (%s)', async direction => {
  const drag = await mountDrag(direction);
  const targetTravel = 2 * (drag.props.layout.cardHeight + drag.props.layout.gap);
  let frameCount = 0;
  await act(async () => {
    // Cross two rows regardless of speed tuning, with a bounded frame budget.
    while (frameCount < 500) {
      // The native scroll boundary acknowledges older outstanding commands,
      // interleaved with newer ones. This is not simulated by the stock mock.
      const commands = drag.requestedOffsets();
      if (Math.abs((commands.at(-1) ?? drag.initialOffset) - drag.initialOffset) >= targetTravel) break;
      frameCount++;
      drag.observedScrollY.value = frameCount % 2 === 0
        ? commands[Math.max(0, commands.length - 20)] ?? drag.initialOffset
        : commands.at(-1) ?? drag.initialOffset;
      drag.tick(frameCount * 16);
    }
  });
  const commands = drag.requestedOffsets();
  expect(frameCount).toBeLessThan(500);
  expect(commands.length).toBeGreaterThan(1);
  for (let index = 1; index < commands.length; index++) {
    expect(direction * (commands[index] - commands[index - 1])).toBeGreaterThan(0);
  }
  const firstDelta = commands[0] - drag.initialOffset;
  expect(commands.at(-1)! - drag.initialOffset).toBeCloseTo(firstDelta * frameCount, 6);

  // Even with the final acknowledgment late, release must land in the slot
  // reached by the drag, without jumping when animation ownership is handed off.
  const destination = drag.from + direction * 4;
  await act(async () => {
    drag.observedScrollY.value = drag.initialOffset;
    drag.release();
  });
  const expectedOrder = drag.props.items.map(item => item.id);
  expectedOrder.splice(drag.from, 1);
  expectedOrder.splice(destination, 0, `${drag.from}`);
  expect(drag.props.onReorder).toHaveBeenCalledWith(expectedOrder);
  drag.view.rerender(<RoutineReorderGrid {...drag.props} />);
  const transforms = StyleSheet.flatten(screen.getByTestId(`routine-position-${drag.from}`).props.style).transform;
  expect(transforms.find((value: Record<string, number>) => 'translateY' in value).translateY)
    .toBeCloseTo(getRoutinePosition(destination, drag.props.layout).y, 6);
});

it('counts time only once when scroll events deliver repeated or backward frame timestamps', async () => {
  const drag = await mountDrag();
  await act(async () => drag.tick(16));
  const firstOffset = drag.requestedOffsets().at(-1)!;
  await act(async () => {
    drag.tick(10);
    drag.tick(16);
    drag.tick(16);
  });
  expect(drag.requestedOffsets()).toEqual([firstOffset]);
  await act(async () => drag.tick(32));
  expect(drag.requestedOffsets().at(-1)).toBeCloseTo(firstOffset * 2, 6);
});

it('stops away from the edge and reverses direction from its commanded position', async () => {
  const drag = await mountDrag();
  await act(async () => {
    for (let frame = 1; frame <= 40; frame++) drag.tick(frame * 16);
  });
  const before = drag.requestedOffsets();
  await act(async () => {
    drag.move(300);
    drag.tick(656);
    drag.tick(672);
  });
  expect(drag.requestedOffsets()).toEqual(before);
  await act(async () => {
    drag.move(148);
    for (let frame = 43; frame <= 90; frame++) drag.tick(frame * 16);
  });
  const reversing = drag.requestedOffsets().slice(before.length);
  expect(reversing.length).toBeGreaterThan(1);
  expect(reversing[0]).toBeLessThan(before.at(-1)!);
  for (let index = 1; index < reversing.length; index++) expect(reversing[index]).toBeLessThan(reversing[index - 1]);
  expect(reversing.at(-1)).toBe(0);
});

it('cancels without saving and starts the next drag from the actual viewport position', async () => {
  const drag = await mountDrag();
  await act(async () => drag.tick(16));
  const delta = drag.requestedOffsets()[0];
  await act(async () => { expect(drag.cancel()).toBe(true); });
  drag.scrollTo.mockClear();
  await act(async () => {
    drag.observedScrollY.value = 37;
    drag.tick(1000);
  });
  expect(drag.scrollTo).not.toHaveBeenCalled();
  expect(drag.props.onReorder).not.toHaveBeenCalled();
  await act(async () => {
    drag.start();
    drag.tick(2000);
    drag.move(drag.initialPointer + 16);
    drag.tick(2016);
  });
  expect(drag.requestedOffsets()).toEqual([37 + delta]);
});
