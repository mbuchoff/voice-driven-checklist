import { Easing } from 'react-native-reanimated';

const CSS_EASE_POINTS = [0.25, 0.1, 0.25, 1] as const;

/**
 * CSS's `ease`, which the prototype's moves use. Reanimated's `Easing.ease`
 * is a different curve: an ease-in (bezier 0.42, 0, 1, 1) that starts slowly.
 */
export const CSS_EASE = Easing.bezier(...CSS_EASE_POINTS);
/** The same curve as a plain function of progress, for inside a worklet. */
export const cssEase = Easing.bezierFn(...CSS_EASE_POINTS);
