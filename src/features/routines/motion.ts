import { Easing, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

const CSS_EASE_POINTS = [0.25, 0.1, 0.25, 1] as const;
const QUICK_THEN_GENTLE_POINTS = [0.22, 0.75, 0.2, 1] as const;

/**
 * CSS's `ease`, which the prototype's moves use. Reanimated's `Easing.ease`
 * is a different curve: an ease-in (bezier 0.42, 0, 1, 1) that starts slowly.
 */
export const CSS_EASE = Easing.bezier(...CSS_EASE_POINTS);
/** The same curve as a plain function of progress, for inside a worklet. */
export const cssEase = Easing.bezierFn(...CSS_EASE_POINTS);

/** Quick, then gentle: the routines' moves, and Round 27's word glide. */
export const QUICK_THEN_GENTLE = Easing.bezier(...QUICK_THEN_GENTLE_POINTS);
/** The same curve as a plain function of progress, for inside a worklet. */
export const quickThenGentle = Easing.bezierFn(...QUICK_THEN_GENTLE_POINTS);

/**
 * How the steps a dragged step passes, and its slot, glide to make room:
 * 26D's spring. A layout transition starts in the same commit that moves a
 * step, so a drop's new order lands without a stray frame.
 */
export const STEP_MAKE_ROOM_MS = 340;
export const STEP_MAKE_ROOM = LinearTransition.duration(STEP_MAKE_ROOM_MS).easing(Easing.bezier(0.34, 1.4, 0.5, 1));

/** How fast an open step's number and time move away (and back when it closes). */
export const STEP_OPEN_MS = 220;
/** How fast an open step's chips fold open and away. */
export const CHIP_FOLD_MS = 220;

/** Sheets, bars and toasts fade in, and out faster. */
export const FADE_IN = FadeIn.duration(150);
export const FADE_OUT = FadeOut.duration(75);
