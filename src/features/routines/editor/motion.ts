import { Easing } from 'react-native-reanimated';

/**
 * CSS's `ease`, which the prototype's moves use. Reanimated's `Easing.ease`
 * is a different curve: an ease-in (bezier 0.42, 0, 1, 1) that starts slowly.
 */
export const CSS_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
