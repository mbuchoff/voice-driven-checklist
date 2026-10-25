import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { elapsedRealtimeMs } from '@/src/services/clock/elapsedRealtime';
import {
  acquireCountdownWakeLock,
  releaseCountdownWakeLock,
} from '@/src/services/power/countdownWakeLock';

const TICK_MS = 250;
/** The wake lock outlasts the countdown a little, as a safety net. */
const WAKE_LOCK_MARGIN_MS = 60_000;

type Options = {
  /** The current step's timer, or null for an untimed step. */
  timerSeconds: number | null;
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

export type StepCountdown = { remainingSeconds: number; totalSeconds: number };

/**
 * A step's countdown: it starts the moment the run arrives at a timed step,
 * keeps running through a repeat, and reports zero exactly once. Time is
 * measured on a clock that keeps counting while the phone sleeps, so it stays
 * right when timers run late or the time of day changes. Null for an untimed
 * step or once the run is over.
 */
export function useStepCountdown({
  timerSeconds,
  arrival,
  active,
  keepsRunningInBackground,
  onExpire,
}: Options): StepCountdown | null {
  // The time left belongs to the arrival it was counted for, so a new
  // arrival shows its own full time from its first render.
  const [left, setLeft] = useState<{ arrival: number; seconds: number } | null>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const backgroundRef = useRef(keepsRunningInBackground);
  backgroundRef.current = keepsRunningInBackground;
  // The run screen opens in front; app state changes keep this current.
  const inFrontRef = useRef(true);
  const deadlineRef = useRef(0);
  const timed = active && !!timerSeconds;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      inFrontRef.current = state === 'active';
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!timed || !timerSeconds) return;
    const deadline = elapsedRealtimeMs() + timerSeconds * 1000;
    deadlineRef.current = deadline;
    let fired = false;
    const tick = () => {
      if (fired) return;
      const remaining = deadline - elapsedRealtimeMs();
      const seconds = Math.max(0, Math.ceil(remaining / 1000));
      setLeft((current) =>
        current?.arrival === arrival && current.seconds === seconds ? current : { arrival, seconds });
      if (remaining > 0) return;
      // Without the listening service, a countdown that ran out while the
      // app was in the background moves the run on once it's back in front.
      if (!backgroundRef.current && !inFrontRef.current) return;
      fired = true;
      clearInterval(interval);
      onExpireRef.current(arrival);
    };
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
    };
  }, [arrival, timed, timerSeconds]);

  // A voice run holds a wake lock while it's on a timed step, from arrival
  // until it moves on (the next step's lock takes over without a gap), and
  // lets go if voice is lost.
  const holdsWakeLock = timed && keepsRunningInBackground;
  useEffect(() => {
    if (!holdsWakeLock) return;
    acquireCountdownWakeLock(deadlineRef.current - elapsedRealtimeMs() + WAKE_LOCK_MARGIN_MS);
    return releaseCountdownWakeLock;
  }, [arrival, holdsWakeLock]);

  if (!timed || !timerSeconds) return null;
  return {
    remainingSeconds: left?.arrival === arrival ? left.seconds : timerSeconds,
    totalSeconds: timerSeconds,
  };
}
