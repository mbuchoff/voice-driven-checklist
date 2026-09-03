import { useCallback, useEffect, useRef } from 'react';
import { Animated } from 'react-native';

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

export function useRoutineSelectionFeedback(
  feedback: RoutineSelectionFeedback,
  onComplete: () => void,
) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const callback = useRef(onComplete);
  callback.current = onComplete;

  useEffect(
    () => () => {
      animation.current?.stop();
    },
    [],
  );

  const run = useCallback(() => {
    animation.current?.stop();
    scale.setValue(1);
    translateY.setValue(0);
    const motion = selectionMotion[feedback];
    const moveTo = (
      nextScale: number,
      nextTranslateY: number,
      duration: number,
    ) =>
      Animated.parallel([
        Animated.timing(scale, {
          toValue: nextScale,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: nextTranslateY,
          duration,
          useNativeDriver: true,
        }),
      ]);
    const next = Animated.sequence([
      moveTo(
        motion.pressedScale,
        motion.pressedTranslateY,
        PRESS_DURATION_MS,
      ),
      moveTo(1, 0, RELEASE_DURATION_MS),
    ]);
    animation.current = next;
    next.start(({ finished }) => {
      if (animation.current === next) animation.current = null;
      if (finished) callback.current();
    });
  }, [feedback, scale, translateY]);

  return { run, scale, translateY };
}
