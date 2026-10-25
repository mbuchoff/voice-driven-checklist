import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { cssEase } from './motion';
import { STEP_TEXT_BOX, STEP_WORDS, TEXT_PAD } from './stepRowMetrics';
import {
  fadeThrough,
  glideLength,
  planWordGlide,
  spotsFromLefts,
  wordProgress,
  type WordMove,
  type WordSpot,
} from './wordGlidePlan';

/** Round 27's "quick, then gentle" for the words (the box's height uses CSS's ease). */
const QUICK_THEN_GENTLE = Easing.bezierFn(0.22, 0.75, 0.2, 1);

type Lefts = (number | undefined)[];
export type Glide = { plan: WordMove[]; after: WordSpot[]; linePitch: number; fromHeight: number; toHeight: number; length: number };
export type WordSpots = { before: WordSpot[]; after: WordSpot[] };

const linesHeight = (spots: WordSpot[], linePitch: number) =>
  (spots[spots.length - 1].line + 1) * linePitch + 2 * TEXT_PAD.y;

/**
 * The glide between two layouts of the words, or null if no word changes
 * lines. `linePitch` is the words' line height as shown, which grows with
 * Android's font size.
 */
export function makeGlide({ before, after }: WordSpots, boxShift: number, linePitch: number): Glide | null {
  const plan = planWordGlide(before, after, boxShift, linePitch);
  if (!plan) return null;
  return {
    plan,
    after,
    linePitch,
    fromHeight: linesHeight(before, linePitch),
    toHeight: linesHeight(after, linePitch),
    length: glideLength(plan.length),
  };
}

/**
 * Lays a step's words out, unseen, in a text box of each of two widths
 * (padding included), word by word, and reports where each one lands.
 */
export function WordLayouts({
  index,
  text,
  widths,
  names,
  onMeasured,
}: {
  index: number;
  text: string;
  widths: [number, number];
  /** For the measuring views' test IDs. */
  names: [string, string];
  onMeasured: (first: WordSpot[], second: WordSpot[]) => void;
}) {
  const words = useMemo(() => text.trim().split(/\s+/), [text]);
  const [space, setSpace] = useState(0);
  const [lefts, setLefts] = useState<[Lefts, Lefts]>([[], []]);
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current || !space) return;
    if (words.some((_, i) => lefts[0][i] === undefined || lefts[1][i] === undefined)) return;
    reported.current = true;
    onMeasured(spotsFromLefts(lefts[0] as number[]), spotsFromLefts(lefts[1] as number[]));
  }, [lefts, onMeasured, space, words]);

  return (
    <>
      <Text
        testID={`word-space-${index}-${names[0]}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[STEP_WORDS, { position: 'absolute', opacity: 0 }]}
        onLayout={(event) => setSpace(event.nativeEvent.layout.width)}
      >
        {' '}
      </Text>
      {space ? ([0, 1] as const).map((side) => (
        <View
          key={side}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            opacity: 0,
            top: 0,
            left: 0,
            width: Math.max(0, widths[side] - 2 * TEXT_PAD.x),
            flexDirection: 'row',
            flexWrap: 'wrap',
            columnGap: space,
          }}
        >
          {words.map((word, i) => (
            <Text
              key={i}
              testID={`word-measure-${index}-${names[side]}-${i}`}
              numberOfLines={1}
              style={STEP_WORDS}
              onLayout={(event) => {
                const { x } = event.nativeEvent.layout;
                setLefts((current) => {
                  const next: [Lefts, Lefts] = [[...current[0]], [...current[1]]];
                  next[side][i] = x;
                  return next;
                });
              }}
            >
              {word}
            </Text>
          ))}
        </View>
      )) : null}
    </>
  );
}

/** How the text box moves along the row as `progress` goes toward `target`. */
type BoxTravel = {
  /** The row's open progress, which moves the text box. */
  progress: SharedValue<number>;
  /** Where `progress` ends: 1 opening, 0 closing. */
  target: 0 | 1;
  /** How far the text box's left edge moves along the row. */
  boxShift: number;
};

/**
 * The step's old lines, held where they were while its words are measured
 * for a glide (the step opened or closed before they were).
 */
export function HeldWords({
  index,
  text,
  color,
  width,
  travel: { progress, target, boxShift },
}: {
  index: number;
  text: string;
  color: string;
  /** The text box's width before the move. */
  width: number;
  travel: BoxTravel;
}) {
  const travel = target === 1 ? boxShift : -boxShift;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: travel * (1 - target - progress.value) }],
  }));
  return (
    <Animated.Text
      testID={`word-hold-${index}`}
      textBreakStrategy="simple"
      style={[STEP_TEXT_BOX, { color, width }, style]}
    >
      {text.trim()}
    </Animated.Text>
  );
}

/**
 * Stands in for a step's text while its number and time move (Round 27): the
 * words glide to their new lines (words that keep their line slide, words
 * that change lines fade out and in) while the box eases to its new height.
 */
export function WordGlide({
  index,
  text,
  color,
  glide,
  width,
  travel: { progress, target, boxShift },
  onDone,
}: {
  index: number;
  /** The words the glide was planned for. */
  text: string;
  color: string;
  glide: Glide;
  /** The text box's width after the move. */
  width: number;
  travel: BoxTravel;
  /** The step's own text can take over again. */
  onDone: () => void;
}) {
  const words = useMemo(() => text.trim().split(/\s+/), [text]);
  const clock = useSharedValue(0);

  // One clock drives every word and the box's height, from 0 when they
  // first show, so their first frame is where the old lines were.
  useEffect(() => {
    clock.value = withTiming(glide.length, { duration: glide.length, easing: Easing.linear });
    const done = setTimeout(onDone, glide.length + 16);
    return () => clearTimeout(done);
    // Runs once: each glide is its own mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The words sit where the box ends up while it moves there.
  const travel = target === 1 ? boxShift : -boxShift;
  const layerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: travel * (target - progress.value) }],
  }));
  const boxStyle = useAnimatedStyle(() => {
    const t = cssEase(Math.min(1, clock.value / glide.length));
    return { height: glide.fromHeight + (glide.toHeight - glide.fromHeight) * t };
  });

  // Each piece also gets its starting value as a plain style: a newly
  // mounted view's animated style can miss its first frame.
  return (
    <Animated.View testID={`word-glide-${index}`} pointerEvents="none" style={[{ height: glide.fromHeight }, boxStyle]}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: TEXT_PAD.y,
            left: TEXT_PAD.x,
            width: width - 2 * TEXT_PAD.x,
            transform: [{ translateX: travel * (target - progress.value) }],
          },
          layerStyle,
        ]}
      >
        {words.map((word, i) => (
          <GlidingWord
            key={i}
            word={word}
            color={color}
            spot={glide.after[i]}
            move={glide.plan[i]}
            linePitch={glide.linePitch}
            index={i}
            clock={clock}
          />
        ))}
      </Animated.View>
    </Animated.View>
  );
}

function GlidingWord({
  word,
  color,
  spot,
  move,
  linePitch,
  index,
  clock,
}: {
  word: string;
  color: string;
  spot: WordSpot;
  move: WordMove;
  linePitch: number;
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
      numberOfLines={1}
      style={[
        STEP_WORDS,
        {
          position: 'absolute',
          left: spot.x,
          top: spot.line * linePitch,
          color,
          transform: [{ translateX: move.dx }, { translateY: move.dy }],
        },
        style,
      ]}
    >
      {word}
    </Animated.Text>
  );
}
