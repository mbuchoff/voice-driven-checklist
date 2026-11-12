import type { GestureStateManager } from 'react-native-gesture-handler';
import { withDelay, withTiming, type SharedValue } from 'react-native-reanimated';

/**
 * For a gesture with manual activation (holding a step or a routine card to
 * lift it): activates it once the finger has been held `ms`, unless
 * `cancelAnimation(activation)` cancels the hold first. A worklet.
 */
export function activateAfterHold(
  activation: SharedValue<number>,
  ms: number,
  manager: GestureStateManager,
) {
  'worklet';
  activation.value = 0;
  activation.value = withDelay(
    ms,
    withTiming(1, { duration: 0 }, (finished) => {
      if (finished) manager.activate();
    }),
  );
}
