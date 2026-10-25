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
  spotsFromLefts,
  wordProgress,
  type WordMove,
  type WordSpot,
} from './wordGlidePlan';

/** A step's words, as the row shows them. */
export const STEP_WORDS = { fontSize: 20, lineHeight: 26 } as const;
const PAD_X = 6;
const PAD_Y = 11;
/** Round 27's "quick, then gentle" for the words; CSS's ease for the box's height (see CSS_EASE). */
const QUICK_THEN_GENTLE = Easing.bezierFn(0.22, 0.75, 0.2, 1);
const EASE = Easing.bezierFn(0.25, 0.1, 0.25, 1);

type Lefts = (number | undefined)[];
type Glide = { plan: WordMove[]; after: WordSpot[]; fromHeight: number; toHeight: number; length: number };
export type WordSpots = { before: WordSpot[]; after: WordSpot[] };

const linesHeight = (spots: WordSpot[]) =>
  (spots[spots.length - 1].line + 1) * STEP_WORDS.lineHeight + 2 * PAD_Y;

/** The glide between two layouts of the words, or null if no word changes lines. */
export function makeGlide({ before, after }: WordSpots, boxShift: number): Glide | null {
  const plan = planWordGlide(before, after, boxShift, STEP_WORDS.lineHeight);
  if (!plan) return null;
  return { plan, after, fromHeight: linesHeight(before), toHeight: linesHeight(after), length: glideLength(plan.length) };
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
            width: Math.max(0, widths[side] - 2 * PAD_X),
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

/**
 * Stands in for a step's text while its number and time move (Round 27): the
 * words glide to their new lines (words that keep their line slide, words
 * that change lines fade out and in) while the box eases to its new height.
 * With `spots` measured ahead of time it starts at once; otherwise it holds
 * the old lines where they were until it has measured the words itself.
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
  spots,
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
  /** The words' layouts before and after, if already measured. */
  spots?: WordSpots;
  /** The step's own text can take over again. */
  onDone: () => void;
}) {
  const words = useMemo(() => text.trim().split(/\s+/), [text]);
  // Undefined while measuring; null when no word changes lines.
  const [glide, setGlide] = useState<Glide | null | undefined>(() => (spots ? makeGlide(spots, boxShift) : undefined));
  const clock = useSharedValue(0);

  // One clock drives every word and the box's height, from 0 when they
  // first show, so their first frame is where the old lines were.
  useEffect(() => {
    if (glide === null) {
      onDone();
      return;
    }
    if (!glide) return;
    clock.value = withTiming(glide.length, { duration: glide.length, easing: Easing.linear });
    const done = setTimeout(onDone, glide.length + 16);
    return () => clearTimeout(done);
    // Starts once, when the plan is made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glide]);

  // The text box moves `travel` along the row as progress goes from 0 to 1.
  const travel = target === 1 ? boxShift : -boxShift;
  // While measuring, the old lines stay where they were...
  const holdStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: travel * (1 - target - progress.value) }],
  }));
  // ...and the words sit where the box ends up while it moves there.
  const layerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: travel * (target - progress.value) }],
  }));
  const boxStyle = useAnimatedStyle(() => {
    if (!glide) return {};
    const t = EASE(Math.min(1, clock.value / glide.length));
    return { height: glide.fromHeight + (glide.toHeight - glide.fromHeight) * t };
  }, [glide]);

  return (
    <>
      {glide === undefined ? (
        <>
          <WordLayouts
            index={index}
            text={text}
            widths={[fromWidth, toWidth]}
            names={['before', 'after']}
            onMeasured={(before, after) => setGlide(makeGlide({ before, after }, boxShift))}
          />
          <Animated.Text
            testID={`word-hold-${index}`}
            textBreakStrategy="simple"
            style={[STEP_WORDS, { color, width: fromWidth, paddingHorizontal: PAD_X, paddingVertical: PAD_Y }, holdStyle]}
          >
            {text.trim()}
          </Animated.Text>
        </>
      ) : null}
      {/* Each piece also gets its starting value as a plain style: a newly
          mounted view's animated style can miss its first frame. */}
      {glide ? (
        <Animated.View testID={`word-glide-${index}`} pointerEvents="none" style={[{ height: glide.fromHeight }, boxStyle]}>
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: PAD_Y,
                left: PAD_X,
                width: toWidth - 2 * PAD_X,
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
      numberOfLines={1}
      style={[
        STEP_WORDS,
        {
          position: 'absolute',
          left: spot.x,
          top: spot.line * STEP_WORDS.lineHeight,
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
