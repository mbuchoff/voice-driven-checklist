import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { type GestureType } from 'react-native-gesture-handler';
import * as Reanimated from 'react-native-reanimated';

import {
  flushRunEffects as flush,
  runSnapshot as snapshot,
  setupRunScreen as setup,
} from './RunScreen.testSupport';

const { getByGestureTestId } = jest.requireActual(
  'react-native-gesture-handler/lib/commonjs/jestUtils',
) as typeof import('react-native-gesture-handler/lib/typescript/jestUtils');

async function beginStopHold() {
  const gesture = getByGestureTestId('stop-hold-gesture') as GestureType;
  await act(async () => {
    gesture.handlers.onBegin?.({ x: 22, y: 22 } as never);
    jest.advanceTimersByTime(0);
    await Promise.resolve();
  });
  return gesture;
}

async function releaseStopHold(gesture: GestureType) {
  await act(async () => {
    gesture.handlers.onFinalize?.({} as never, false);
    jest.advanceTimersByTime(0);
    await Promise.resolve();
  });
}

describe('RunScreen stop control', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('keeps the run active when the pointer hold is released early', async () => {
    const holdCallbacks: ((finished?: boolean) => void)[] = [];
    const { onExit, onRequestStop } = setup({ screenReaderEnabled: false });
    await flush();
    jest.useFakeTimers();
    jest.spyOn(Reanimated, 'withTiming').mockImplementation(
      ((value, _config, callback) => {
        if (callback) holdCallbacks.push(callback);
        return value;
      }) as typeof Reanimated.withTiming,
    );

    const gesture = await beginStopHold();
    expect(screen.queryByText(snapshot.checklistTitle)).toBeNull();
    expect(screen.getByText(/keep holding/i)).toBeOnTheScreen();
    act(() => jest.advanceTimersByTime(600));
    await releaseStopHold(gesture);

    await act(async () => {
      holdCallbacks.at(-1)?.(true);
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });

    act(() => jest.advanceTimersByTime(1200));
    expect(onExit).not.toHaveBeenCalled();
    expect(onRequestStop).not.toHaveBeenCalled();
    expect(screen.queryByText(/keep holding/i)).toBeNull();
    expect(screen.getByText(snapshot.checklistTitle)).toBeOnTheScreen();
  });

  it('stops directly after the complete 1.2-second pointer hold', async () => {
    const holdCallbacks: ((finished?: boolean) => void)[] = [];
    const holdConfigs: Reanimated.WithTimingConfig[] = [];
    const { onExit, onRequestStop } = setup({ screenReaderEnabled: false });
    await flush();
    jest.useFakeTimers();
    jest.spyOn(Reanimated, 'withTiming').mockImplementation(
      ((value, config, callback) => {
        if (callback) {
          holdCallbacks.push(callback);
          holdConfigs.push(config ?? {});
        }
        return value;
      }) as typeof Reanimated.withTiming,
    );

    await beginStopHold();
    expect(holdCallbacks).toHaveLength(1);
    expect(holdConfigs).toEqual([
      expect.objectContaining({
        duration: 1200,
        reduceMotion: Reanimated.ReduceMotion.Never,
      }),
    ]);
    act(() => jest.advanceTimersByTime(10_000));

    expect(onExit).not.toHaveBeenCalled();
    await act(async () => {
      holdCallbacks.at(-1)?.(true);
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onRequestStop).not.toHaveBeenCalled();
  });

  it('ignores a delayed completion from a released hold after a new hold begins', async () => {
    const holdCallbacks: ((finished?: boolean) => void)[] = [];
    const { onExit } = setup({ screenReaderEnabled: false });
    await flush();
    jest.useFakeTimers();
    jest.spyOn(Reanimated, 'withTiming').mockImplementation(
      ((value, _config, callback) => {
        if (callback) holdCallbacks.push(callback);
        return value;
      }) as typeof Reanimated.withTiming,
    );

    const firstGesture = await beginStopHold();
    const firstCompletion = holdCallbacks.at(-1);
    await releaseStopHold(firstGesture);
    const secondGesture = await beginStopHold();

    await act(async () => {
      firstCompletion?.(true);
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(onExit).not.toHaveBeenCalled();
    await releaseStopHold(secondGesture);
  });

  it('does not dismiss the completion screen when a held X finishes late', async () => {
    const holdCallbacks: ((finished?: boolean) => void)[] = [];
    const { onExit } = setup({
      screenReaderEnabled: false,
      snapshot: {
        checklistId: 'one-step',
        checklistTitle: 'One step',
        items: [{ id: 'only', text: 'Only step', order: 0 }],
      },
    });
    await flush();
    jest.useFakeTimers();
    jest.spyOn(Reanimated, 'withTiming').mockImplementation(
      ((value, _config, callback) => {
        if (callback) holdCallbacks.push(callback);
        return value;
      }) as typeof Reanimated.withTiming,
    );

    await beginStopHold();
    const stopCompletion = holdCallbacks.at(-1);
    fireEvent.press(screen.getByTestId('manual-next'));
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(screen.getByTestId('completion-restart')).toBeOnTheScreen();

    await act(async () => {
      stopCompletion?.(true);
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByTestId('completion-restart')).toBeOnTheScreen();
  });

  it('opens confirmation when TalkBack activates the X', async () => {
    const { onExit, onRequestStop } = setup({ screenReaderEnabled: true });
    await flush();

    fireEvent.press(screen.getByTestId('stop-run'));

    expect(onRequestStop).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
  });

  it('uses confirmation when TalkBack turns on after the run opens', async () => {
    let onScreenReaderChanged: (enabled: boolean) => void = () => undefined;
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation((_event, listener) => {
        onScreenReaderChanged = listener as unknown as (enabled: boolean) => void;
        return { remove } as never;
      });
    const { onRequestStop, unmount } = setup();
    await flush();

    act(() => onScreenReaderChanged(true));
    fireEvent.press(screen.getByTestId('stop-run'));

    expect(onRequestStop).toHaveBeenCalledTimes(1);
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('uses confirmation while TalkBack detection is still pending', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
      .mockImplementation(() => new Promise(() => undefined));
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({
      remove: jest.fn(),
    } as never);
    const { onRequestStop } = setup();
    await flush();

    fireEvent.press(screen.getByTestId('stop-run'));

    expect(onRequestStop).toHaveBeenCalledTimes(1);
  });

  it('does not let the initial TalkBack query overwrite a newer change event', async () => {
    let finishInitialQuery: (enabled: boolean) => void = () => undefined;
    let onScreenReaderChanged: (enabled: boolean) => void = () => undefined;
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(
      () => new Promise((resolve) => {
        finishInitialQuery = resolve;
      }),
    );
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation((_event, listener) => {
        onScreenReaderChanged = listener as unknown as (enabled: boolean) => void;
        return { remove: jest.fn() } as never;
      });
    const { onRequestStop } = setup();
    await flush();

    act(() => onScreenReaderChanged(true));
    await act(async () => finishInitialQuery(false));
    await flush();
    fireEvent.press(screen.getByTestId('stop-run'));

    expect(onRequestStop).toHaveBeenCalledTimes(1);
  });
});
