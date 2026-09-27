import { createRef } from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { ScrollView, StyleSheet, Vibration } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';
import * as Reanimated from 'react-native-reanimated';

import { light } from '@/src/theme/palette';

import { getRoutineGridMetrics } from './routineGrid';
import { RoutineReorderGrid } from './RoutineReorderGrid';

const { getByGestureTestId } = jest.requireActual(
  'react-native-gesture-handler/lib/commonjs/jestUtils',
) as typeof import('react-native-gesture-handler/lib/typescript/jestUtils');

afterEach(() => jest.restoreAllMocks());

it('keeps the released card in front until completion and ignores an old completion after re-grabbing', async () => {
  jest.spyOn(Vibration, 'vibrate').mockImplementation();
  const completions: ((finished?: boolean) => void)[] = [];
  // Hold completion delivery at the native animator boundary; do not replace
  // the grid's ownership or generation checks with a mock.
  jest.spyOn(Reanimated, 'withTiming').mockImplementation((value, config, callback) => {
    if (config?.duration === 220 && callback) completions.push(callback);
    return value;
  });
  const shared = (value: number) => ({ value } as Reanimated.SharedValue<number>);
  const props = {
    orderRevision: 0,
    items: ['a', 'b'].map(id => ({ id, title: id, items: [{ text: 'Step' }] })),
    layout: getRoutineGridMetrics(361, 2), theme: light,
    scrollRef: createRef<ScrollView>() as Reanimated.AnimatedRef<ScrollView>,
    scrollY: shared(0), viewportHeight: shared(400), contentHeight: shared(400),
    enabled: true, onWidthChange: jest.fn(), onEdit: jest.fn(), onStart: jest.fn(),
    onReorder: jest.fn(), onMoveByAccessibility: jest.fn(),
  };
  const view = render(<RoutineReorderGrid {...props} />);
  const gestureFor = (id: string) => getByGestureTestId(`routine-hold-gesture-${id}`) as GestureType;
  const start = (gesture: GestureType) => {
    gesture.handlers.onBegin?.({} as never);
    gesture.handlers.onStart?.({ absoluteY: 200 } as never);
  };
  const end = (gesture: GestureType) => {
    gesture.handlers.onEnd?.({} as never, true);
    gesture.handlers.onFinalize?.({} as never, true);
  };
  const elevation = (id: string) => StyleSheet.flatten(screen.getByTestId(`routine-position-${id}`).props.style).elevation;
  const first = gestureFor('a');
  await act(async () => { start(first); end(first); });
  view.rerender(<RoutineReorderGrid {...props} />);
  expect(elevation('a')).toBe(12);
  const second = gestureFor('b');
  await act(async () => { start(second); completions[0](true); });
  view.rerender(<RoutineReorderGrid {...props} />);
  expect(elevation('a')).toBe(0);
  expect(elevation('b')).toBe(12);
  await act(async () => { end(second); completions[1](true); });
  view.rerender(<RoutineReorderGrid {...props} />);
  expect(elevation('b')).toBe(0);
});

it('runs adaptive-edge scrolling through the frame loop and drops into the newly revealed row', async () => {
  jest.spyOn(Vibration, 'vibrate').mockImplementation();
  jest.spyOn(Reanimated, 'measure').mockReturnValue({ x: 0, y: 0, pageX: 0, pageY: 100, width: 361, height: 400 });
  const frames = jest.spyOn(Reanimated, 'useFrameCallback');
  const scrollTo = jest.spyOn(Reanimated, 'scrollTo');
  // Mock only native frame delivery, scrolling, and shared-value storage. The
  // production frame callback, placement and edge calculations execute below.
  const shared = (value: number) => ({ value } as Reanimated.SharedValue<number>);
  const scrollY = shared(0);
  const onReorder = jest.fn();
  const items = Array.from({ length: 8 }, (_, index) => ({
    id: `${index}`, title: `Routine ${index}`,
    items: [{ text: 'Step' }],
  }));
  render(<RoutineReorderGrid
    orderRevision={0}
    items={items} layout={getRoutineGridMetrics(361, items.length)} theme={light}
    scrollRef={createRef<ScrollView>() as Reanimated.AnimatedRef<ScrollView>}
    scrollY={scrollY} viewportHeight={shared(400)} contentHeight={shared(700)}
    enabled onWidthChange={jest.fn()} onEdit={jest.fn()} onStart={jest.fn()}
    onReorder={onReorder} onMoveByAccessibility={jest.fn()}
  />);
  const gesture = getByGestureTestId('routine-hold-gesture-2') as GestureType;
  const manager = { activate: jest.fn(), fail: jest.fn() };
  let timestamp = 0;
  const tick = () => {
    timestamp += 16;
    frames.mock.calls.at(-1)?.[0]({ timestamp, timeSincePreviousFrame: 16, timeSinceFirstFrame: timestamp });
  };
  act(() => tick());
  expect(scrollTo).not.toHaveBeenCalled();
  await act(async () => {
    gesture.handlers.onBegin?.({} as never);
    gesture.handlers.onTouchesDown?.({ numberOfTouches: 1,
      allTouches: [{ absoluteX: 90, absoluteY: 480 }] } as never, manager as never);
    gesture.handlers.onStart?.({ absoluteY: 480 } as never);
    for (let frame = 0; frame < 30; frame += 1) tick();
  });
  expect(scrollY.value).toBe(0); // Initial hold inside the lower edge stays still.
  await act(async () => {
    gesture.handlers.onTouchesMove?.({
      allTouches: [{ absoluteX: 90, absoluteY: 496 }] } as never, manager as never);
    gesture.handlers.onUpdate?.({ absoluteY: 496, translationX: 0,
      translationY: 16, velocityX: 0, velocityY: 250 } as never);
    for (let frame = 0; frame < 180; frame += 1) tick();
  });
  // Content 700 minus viewport 400. This boundary records the command; native
  // onScroll acknowledgments (which may lag) are exercised separately.
  expect(scrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 300, false);
  await act(async () => {
    gesture.handlers.onEnd?.({} as never, true);
    gesture.handlers.onFinalize?.({} as never, true);
  });
  expect(onReorder).toHaveBeenCalledWith(['0', '1', '3', '4', '5', '6', '2', '7']);
  scrollTo.mockClear();
  act(() => tick());
  expect(scrollTo).not.toHaveBeenCalled();
});
