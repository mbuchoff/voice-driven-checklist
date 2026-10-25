import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import {
  fadeThrough,
  glideLength,
  planWordGlide,
  wordProgress,
  type WordMove,
  type WordSpot,
} from './wordGlidePlan';

/** A step's words, as the row shows them. */
export const STEP_WORDS = { fontSize: 20, lineHeight: 26 } as const;
const PAD_X = 6;
const PAD_Y = 11;
/** Round 27's "quick, then gentle". */
const QUICK_THEN_GENTLE = Easing.bezierFn(0.22, 0.75, 0.2, 1);

type Spots = (WordSpot | undefined)[];

/**
 * Lays the words out at the two widths a step's text box has, before and
 * after its number and time move, and, if any word changes lines, shows them
 * gliding there in place of the step's own text: words that keep their line
 * slide, words that change lines fade out and in (Round 27).
 */
export function WordGlide({
  index,
  text,
  color,
  fromWidth,
  toWidth,
  boxShift,
  progress,
  target,
  onPlan,
  onDone,
}: {
  index: number;
  text: string;
  color: string;
  /** The text box's width (padding included) before and after the move. */
  fromWidth: number;
  toWidth: number;
  /** How far the text box's left edge moves along the row. */
  boxShift: number;
  /** The row's open progress, which moves the text box. */
  progress: SharedValue<number>;
  /** Where `progress` ends: 1 opening, 0 closing. */
  target: 0 | 1;
  /** Called once the words are measured: the plan, or null if no word changes lines. */
  onPlan: (plan: WordMove[] | null) => void;
  onDone: () => void;
}) {
  const words = useMemo(() => text.trim().split(/\s+/), [text]);
  const [space, setSpace] = useState(0);
  const [before, setBefore] = useState<Spots>([]);
  const [after, setAfter] = useState<Spots>([]);
  const [plan, setPlan] = useState<WordMove[] | null>(null);
  const planned = useRef(false);

  useEffect(() => {
    if (planned.current || !space) return;
    if (words.some((_, i) => !before[i] || !after[i])) return;
    planned.current = true;
    const next = planWordGlide(before as WordSpot[], after as WordSpot[], boxShift, STEP_WORDS.lineHeight);
    setPlan(next);
    onPlan(next);
    if (!next) onDone();
  }, [after, before, boxShift, onDone, onPlan, space, words]);

  // One clock drives every word; the text box eases to its new height.
  const lineCount = (spots: Spots) => Math.max(...spots.map((spot) => (spot ? spot.line : 0))) + 1;
  const fromHeight = lineCount(before) * STEP_WORDS.lineHeight + 2 * PAD_Y;
  const toHeight = lineCount(after) * STEP_WORDS.lineHeight + 2 * PAD_Y;
  const clock = useSharedValue(0);
  const height = useSharedValue(fromHeight);
  useEffect(() => {
    if (!plan) return;
    const length = glideLength(plan.length);
    height.value = fromHeight;
    height.value = withTiming(toHeight, { duration: length, easing: Easing.ease });
    clock.value = withTiming(length, { duration: length, easing: Easing.linear });
    const done = setTimeout(onDone, length + 16);
    return () => clearTimeout(done);
    // Starts once, when the plan is made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const boxStyle = useAnimatedStyle(() => ({ height: height.value }));
  // The words sit where the text box ends up while the box itself moves
  // there: the layer makes up the distance the box has still to go.
  const layerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: boxShift * (target === 1 ? 1 - progress.value : progress.value) }],
  }));

  const measure = (side: 'before' | 'after', width: number, setSpots: (update: (spots: Spots) => Spots) => void) => (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        opacity: 0,
        top: 0,
        left: 0,
        width: Math.max(0, width - 2 * PAD_X),
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: space,
      }}
    >
      {words.map((word, i) => (
        <Text
          key={i}
          testID={`word-measure-${index}-${side}-${i}`}
          style={STEP_WORDS}
          onLayout={(event) => {
            const { x, y } = event.nativeEvent.layout;
            const spot = { x, line: Math.round(y / STEP_WORDS.lineHeight) };
            setSpots((current) => {
              const next = [...current];
              next[i] = spot;
              return next;
            });
          }}
        >
          {word}
        </Text>
      ))}
    </View>
  );

  return (
    <>
      <Text
        testID={`word-space-${index}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[STEP_WORDS, { position: 'absolute', opacity: 0 }]}
        onLayout={(event) => setSpace(event.nativeEvent.layout.width)}
      >
        {' '}
      </Text>
      {space ? measure('before', fromWidth, setBefore) : null}
      {space ? measure('after', toWidth, setAfter) : null}
      {plan ? (
        <Animated.View testID={`word-glide-${index}`} pointerEvents="none" style={[{ overflow: 'visible' }, boxStyle]}>
          <Animated.View
            style={[{ position: 'absolute', top: PAD_Y, left: PAD_X, width: toWidth - 2 * PAD_X }, layerStyle]}
          >
            {words.map((word, i) => (
              <GlidingWord
                      key={i}
                word={word}
                color={color}
                spot={after[i]!}
                move={plan[i]}
                index={i}
                clock={clock}
              />
            ))}
          </Animated.View>
        </Animated.View>
      ) : null}
    </>
  );
}

function GlidingWord({
  word,
  color,
  spot,
  move,
  index,
  clock,
}: {
  word: string;
  color: string;
  spot: WordSpot;
  move: WordMove;
  index: number;
  clock: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const p = wordProgress(clock.value, index, QUICK_THEN_GENTLE);
    if (move.kind === 'slide') {
      return {
        opacity: 1,
        transform: [{ translateX: move.dx * (1 - p) }, { translateY: move.dy * (1 - p) }],
      };
    }
    const fade = fadeThrough(p);
    return {
      opacity: fade.opacity,
      transform: [
        { translateX: fade.atStart ? move.dx : 0 },
        { translateY: fade.atStart ? move.dy : 0 },
      ],
    };
  });
  return (
    <Animated.Text
      style={[STEP_WORDS, { position: 'absolute', left: spot.x, top: spot.line * STEP_WORDS.lineHeight, color }, style]}
    >
      {word}
    </Animated.Text>
  );
}
