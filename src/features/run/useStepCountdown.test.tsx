import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import {
  acquireCountdownWakeLock,
  releaseCountdownWakeLock,
} from '@/src/services/power/countdownWakeLock';

import { useStepCountdown } from './useStepCountdown';

jest.mock('@/src/services/power/countdownWakeLock', () => ({
  acquireCountdownWakeLock: jest.fn(),
  releaseCountdownWakeLock: jest.fn(),
}));

type Props = Parameters<typeof useStepCountdown>[0];

function setup(initial: Partial<Props> = {}) {
  const onExpire = jest.fn();
  const props: Props = {
    timerSeconds: 30,
    arrival: 1,
    active: true,
    keepsRunningInBackground: true,
    onExpire,
    ...initial,
  };
  const hook = renderHook((current: Props) => useStepCountdown(current), { initialProps: props });
  return { ...hook, onExpire, props };
}

describe('useStepCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-22T10:00:00Z'));
    jest.mocked(acquireCountdownWakeLock).mockClear();
    jest.mocked(releaseCountdownWakeLock).mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('counts down from the moment the run arrives and expires once, on time', () => {
    const { result, onExpire } = setup({ timerSeconds: 30 });
    expect(result.current?.remainingSeconds).toBe(30);

    act(() => jest.advanceTimersByTime(15_000));
    expect(result.current?.remainingSeconds).toBe(15);
    act(() => jest.advanceTimersByTime(14_700));
    expect(onExpire).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(300));
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledWith(1);
    act(() => jest.advanceTimersByTime(5_000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('keeps counting through a repeat and starts from full on a new arrival', () => {
    const { result, rerender, props, onExpire } = setup({ timerSeconds: 20 });
    act(() => jest.advanceTimersByTime(12_000));

    rerender({ ...props });
    expect(result.current?.remainingSeconds).toBe(8);

    rerender({ ...props, arrival: 2 });
    expect(result.current?.remainingSeconds).toBe(20);
    act(() => jest.advanceTimersByTime(19_000));
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('does nothing for an untimed step or once the run is over', () => {
    const untimed = setup({ timerSeconds: null });
    expect(untimed.result.current).toBeNull();
    act(() => jest.advanceTimersByTime(60_000));
    expect(untimed.onExpire).not.toHaveBeenCalled();

    const finished = setup({ active: false });
    act(() => jest.advanceTimersByTime(60_000));
    expect(finished.onExpire).not.toHaveBeenCalled();
  });

  it('without voice, waits while the app is in the background and moves on once when it returns', () => {
    const listeners: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: string) => void);
      return { remove: jest.fn() };
    });
    const changeTo = (state: string) => act(() => listeners.forEach((listener) => listener(state)));
    const { onExpire } = setup({ timerSeconds: 10, keepsRunningInBackground: false });

    changeTo('background');
    act(() => jest.advanceTimersByTime(60_000));
    expect(onExpire).not.toHaveBeenCalled();

    changeTo('active');
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('holds a wake lock while a voice run is on a timed step, until the run moves on', () => {
    const { rerender, props, onExpire } = setup({ timerSeconds: 30, keepsRunningInBackground: true });
    expect(acquireCountdownWakeLock).toHaveBeenCalledWith(expect.any(Number));
    expect(jest.mocked(acquireCountdownWakeLock).mock.calls[0][0]).toBeGreaterThanOrEqual(30_000);

    // Zero hands over to the next step with the lock still held...
    act(() => jest.advanceTimersByTime(30_000));
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(releaseCountdownWakeLock).not.toHaveBeenCalled();

    // ...which takes it over.
    rerender({ ...props, arrival: 2 });
    expect(releaseCountdownWakeLock).toHaveBeenCalledTimes(1);
    expect(acquireCountdownWakeLock).toHaveBeenCalledTimes(2);

    rerender({ ...props, arrival: 3, keepsRunningInBackground: false });
    expect(releaseCountdownWakeLock).toHaveBeenCalledTimes(2);
    expect(acquireCountdownWakeLock).toHaveBeenCalledTimes(2);
  });

  it('lets go of the wake lock when voice is lost during a step, and keeps counting', () => {
    const { rerender, props, result } = setup({ timerSeconds: 60, keepsRunningInBackground: true });
    act(() => jest.advanceTimersByTime(20_000));

    rerender({ ...props, keepsRunningInBackground: false });

    expect(releaseCountdownWakeLock).toHaveBeenCalledTimes(1);
    expect(result.current?.remainingSeconds).toBe(40);
  });

  it('starts a new arrival from its own full time from its first render', () => {
    const shown: (number | undefined)[] = [];
    const onExpire = jest.fn();
    const props: Props = { timerSeconds: 20, arrival: 1, active: true, keepsRunningInBackground: false, onExpire };
    const { rerender } = renderHook((current: Props) => {
      const countdown = useStepCountdown(current);
      shown.push(countdown?.remainingSeconds);
      return countdown;
    }, { initialProps: props });
    act(() => jest.advanceTimersByTime(12_000));
    shown.length = 0;

    rerender({ ...props, arrival: 2, timerSeconds: 45 });

    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((seconds) => seconds === 45)).toBe(true);
  });

  it('measures elapsed time, unmoved by changes to the time of day', () => {
    const { onExpire, result } = setup({ timerSeconds: 60 });

    jest.setSystemTime(Date.now() + 120_000);
    act(() => jest.advanceTimersByTime(250));
    expect(onExpire).not.toHaveBeenCalled();
    expect(result.current?.remainingSeconds).toBe(60);

    jest.setSystemTime(Date.now() - 600_000);
    act(() => jest.advanceTimersByTime(59_750));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('releases the wake lock when the countdown is abandoned', () => {
    const { unmount } = setup({ timerSeconds: 3600 });
    jest.mocked(releaseCountdownWakeLock).mockClear();
    unmount();
    expect(releaseCountdownWakeLock).toHaveBeenCalled();
  });
});
