import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  acquireCountdownWakeLock,
  releaseCountdownWakeLock,
} from '@/src/services/power/countdownWakeLock';

const TICK_MS = 250;
/** The wake lock outlasts the countdown a little, as a safety net. */
const WAKE_LOCK_MARGIN_MS = 60_000;

type Options = {
  /** The current step's timer, or null for an untimed step. */
  timerSeconds: number | null | undefined;
  /** Changes each time the run arrives at a step (not on a repeat). */
  arrival: number;
  /** False once the run is over. */
  active: boolean;
  /**
   * True for a voice run, whose listening service keeps the app working with
   * the screen off; the countdown then holds a wake lock and moves on in the
   * background. Otherwise it waits until the app is back in front.
   */
  keepsRunningInBackground: boolean;
  /** Called once when the countdown for `arrival` reaches zero. */
  onExpire: (arrival: number) => void;
};

/**
 * A step's countdown: it starts the moment the run arrives at a timed step,
 * keeps running through a repeat, and reports zero exactly once. Time is
 * measured by the clock, so it stays right even when timers run late.
 */
export function useStepCountdown({
  timerSeconds,
  arrival,
  active,
  keepsRunningInBackground,
  onExpire,
}: Options): { remainingSeconds: number | null; totalSeconds: number | null } {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(
    active && timerSeconds ? timerSeconds : null,
  );
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const backgroundRef = useRef(keepsRunningInBackground);
  backgroundRef.current = keepsRunningInBackground;
  // The run screen opens in front; app state changes keep this current.
  const inFrontRef = useRef(true);
  const timed = active && !!timerSeconds;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      inFrontRef.current = state === 'active';
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!timed || !timerSeconds) {
      setRemainingSeconds(null);
      return;
    }
    const deadline = Date.now() + timerSeconds * 1000;
    let fired = false;
    let wakeLockHeld = false;
    const holdWakeLock = () => {
      if (wakeLockHeld || !backgroundRef.current) return;
      acquireCountdownWakeLock(deadline - Date.now() + WAKE_LOCK_MARGIN_MS);
      wakeLockHeld = true;
    };
    const dropWakeLock = () => {
      if (!wakeLockHeld) return;
      releaseCountdownWakeLock();
      wakeLockHeld = false;
    };
    const tick = () => {
      if (fired) return;
      const left = deadline - Date.now();
      setRemainingSeconds(Math.max(0, Math.ceil(left / 1000)));
      if (left > 0) return;
      // Without the listening service, a countdown that ran out while the
      // app was in the background moves the run on once it's back in front.
      if (!backgroundRef.current && !inFrontRef.current) return;
      fired = true;
      clearInterval(interval);
      dropWakeLock();
      onExpireRef.current(arrival);
    };
    setRemainingSeconds(timerSeconds);
    holdWakeLock();
    const interval = setInterval(tick, TICK_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        inFrontRef.current = true;
        tick();
      }
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
      dropWakeLock();
    };
  }, [arrival, timed, timerSeconds]);

  return { remainingSeconds, totalSeconds: timed ? timerSeconds ?? null : null };
}
