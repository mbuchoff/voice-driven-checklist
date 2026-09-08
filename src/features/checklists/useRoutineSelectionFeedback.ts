import { useCallback, useEffect, useRef } from 'react';
import { Animated } from 'react-native';

import { ROUTINE_HOLD_FEEDBACK_DELAY_MS } from './routineMotion';

type RoutineSelectionFeedback = 'card' | 'control';

const selectionMotion = {
  card: {
    pressedScale: 0.965,
    pressedTranslateY: 3,
  },
  control: {
    pressedScale: 0.9,
    pressedTranslateY: 2,
  },
} as const;

const PRESS_DURATION_MS = 72;
const RELEASE_DURATION_MS = 120;
const PRESS_DELAY_MS = 96;

export function useRoutineSelectionFeedback(
  feedback: RoutineSelectionFeedback,
  onComplete: () => void,
) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const callback = useRef(onComplete);
  callback.current = onComplete;

  const clearPendingFeedback = useCallback(() => {
    clearTimeout(timer.current);
    clearTimeout(releaseTimer.current);
  }, []);

  useEffect(
    () => () => {
      clearPendingFeedback();
      animation.current?.stop();
    },
    [clearPendingFeedback],
  );

  const moveTo = useCallback((pressed: boolean) => {
    animation.current?.stop();
    const motion = selectionMotion[feedback];
    const duration = pressed ? PRESS_DURATION_MS : RELEASE_DURATION_MS;
    const next = Animated.parallel([
        Animated.timing(scale, {
          toValue: pressed ? motion.pressedScale : 1,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: pressed ? motion.pressedTranslateY : 0,
          duration,
          useNativeDriver: true,
        }),
    ]);
    animation.current = next;
    next.start(() => {
      if (animation.current === next) animation.current = null;
    });
  }, [feedback, scale, translateY]);

  const pressIn = useCallback(() => {
    clearPendingFeedback();
    timer.current = setTimeout(() => moveTo(true), PRESS_DELAY_MS);
    if (feedback === 'card') {
      // Match the hold outline without adding onLongPress, which would consume
      // release taps between hold feedback and actual drag activation.
      releaseTimer.current = setTimeout(() => moveTo(false), ROUTINE_HOLD_FEEDBACK_DELAY_MS);
    }
  }, [clearPendingFeedback, feedback, moveTo]);
  const pressOut = useCallback(() => {
    clearPendingFeedback();
    moveTo(false);
  }, [clearPendingFeedback, moveTo]);
  const run = useCallback(() => {
    clearPendingFeedback();
    // A quick tap can finish before the delayed contact feedback starts.
    // Animate the confirmed selection while navigation starts, never after it.
    moveTo(true);
    releaseTimer.current = setTimeout(() => moveTo(false), PRESS_DURATION_MS);
    callback.current();
  }, [clearPendingFeedback, moveTo]);

  return { run, pressIn, pressOut, scale, translateY };
}
