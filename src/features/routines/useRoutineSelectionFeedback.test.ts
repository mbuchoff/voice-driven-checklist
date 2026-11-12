import { act, renderHook } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { useRoutineSelectionFeedback } from './useRoutineSelectionFeedback';

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('returns card feedback to rest at the hold-feedback boundary without consuming a release tap', () => {
  const timing = jest.spyOn(Animated, 'timing');
  const navigate = jest.fn();
  const { result } = renderHook(() => useRoutineSelectionFeedback('card', navigate));
  act(() => result.current.pressIn());
  act(() => jest.advanceTimersByTime(191));
  expect(timing.mock.calls.map(([, config]) => config.toValue)).toEqual([0.965, 3]);
  act(() => jest.advanceTimersByTime(1));
  expect(timing.mock.calls.slice(-2).map(([, config]) => config.toValue)).toEqual([1, 0]);
  expect(navigate).not.toHaveBeenCalled();
  act(() => result.current.run());
  expect(navigate).toHaveBeenCalledTimes(1);
});

it.each(['pressOut', 'unmount'] as const)('cancels delayed card feedback on %s', (end) => {
  const timing = jest.spyOn(Animated, 'timing');
  const { result, unmount } = renderHook(() => useRoutineSelectionFeedback('card', jest.fn()));
  act(() => result.current.pressIn());
  act(() => jest.advanceTimersByTime(50));
  act(() => end === 'unmount' ? unmount() : result.current[end]());
  timing.mockClear();
  act(() => jest.advanceTimersByTime(500));
  expect(timing).not.toHaveBeenCalled();
});

it.each(['card', 'control'] as const)('starts %s push feedback and navigation together on a quick release', (kind) => {
  const timing = jest.spyOn(Animated, 'timing');
  const navigate = jest.fn(() => {
    expect(timing.mock.calls.slice(-2).map(([, config]) => config.toValue))
      .toEqual(kind === 'card' ? [0.965, 3] : [0.9, 2]);
  });
  const { result } = renderHook(() => useRoutineSelectionFeedback(kind, navigate));
  act(() => result.current.pressIn());
  act(() => jest.advanceTimersByTime(40));
  // On a short native tap, onPress can precede the delayed onPressOut.
  act(() => result.current.run());
  expect(navigate).toHaveBeenCalledTimes(1);
  timing.mockClear();
  act(() => jest.advanceTimersByTime(250));
  expect(timing.mock.calls.map(([, config]) => config.toValue)).toEqual([1, 0]);
  expect(navigate).toHaveBeenCalledTimes(1);
});

it('does not auto-release Settings, New or Play feedback during a stationary press', () => {
  const timing = jest.spyOn(Animated, 'timing');
  const { result } = renderHook(() => useRoutineSelectionFeedback('control', jest.fn()));
  act(() => result.current.pressIn());
  act(() => jest.advanceTimersByTime(250));
  expect(timing.mock.calls.map(([, config]) => config.toValue)).toEqual([0.9, 2]);
});
