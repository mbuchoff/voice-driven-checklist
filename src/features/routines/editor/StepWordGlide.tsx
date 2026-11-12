import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { scheduleOnRN } from 'react-native-worklets';

import { cssEase, quickThenGentle } from '../motion';
import { OPEN_BOX_SHIFT, STEP_TEXT_BOX, STEP_WORDS, TEXT_PAD } from './stepRowMetrics';
import {
  fadeThrough,
  glideLength,
  planWordGlide,
  spotsFromLefts,
  wordProgress,
  type WordMove,
  type WordSpot,
} from './wordGlidePlan';


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
  // Where each word starts in each layout, kept out of state: only the
  // finished layouts matter, reported once.
  const lefts = useRef<[Lefts, Lefts]>([[], []]);
  // How many word places are in, in both layouts together.
  const placed = useRef(0);
  const reported = useRef(false);
  const onMeasuredRef = useRef(onMeasured);
  onMeasuredRef.current = onMeasured;
  const place = (side: 0 | 1, i: number, x: number) => {
    if (lefts.current[side][i] === undefined) placed.current += 1;
    lefts.current[side][i] = x;
    if (reported.current || placed.current < 2 * words.length) return;
    reported.current = true;
    const [first, second] = lefts.current;
    onMeasuredRef.current(spotsFromLefts(first as number[]), spotsFromLefts(second as number[]));
  };

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
          testID={`word-layout-${index}-${names[side]}`}
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
              onLayout={(event) => place(side, i, event.nativeEvent.layout.x)}
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
  /** The row's open progress (0 closed, 1 open), which moves the text box. */
  progress: SharedValue<number>;
  /** Where `progress` ends: 1 opening, 0 closing. */
  target: 0 | 1;
  /** How far the text box's left edge is from its closed place when open. */
  openShift: number;
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
  travel: { progress, target, openShift },
}: {
  index: number;
  text: string;
  color: string;
  /** The text box's width before the move. */
  width: number;
  travel: BoxTravel;
}) {
  // Where the box was when the move began, against where it is now.
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: openShift * (1 - target - progress.value) }],
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
  travel: { progress, target, openShift },
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
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const mounted = useRef(true);
  const done = () => {
    if (mounted.current) onDoneRef.current();
  };
  useEffect(() => {
    clock.value = withTiming(glide.length, { duration: glide.length, easing: Easing.linear }, (finished) => {
      if (finished) scheduleOnRN(done);
    });
    return () => {
      mounted.current = false;
      cancelAnimation(clock);
    };
    // Runs once: each glide is its own mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The words sit where the box ends up while it moves there.
  const layerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: openShift * (target - progress.value) }],
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
        testID={`word-glide-layer-${index}`}
        style={[
          {
            position: 'absolute',
            top: TEXT_PAD.y,
            left: TEXT_PAD.x,
            width: width - 2 * TEXT_PAD.x,
            transform: [{ translateX: openShift * (target - progress.value) }],
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
    const p = wordProgress(clock.value, index, quickThenGentle);
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

type Layouts = { key: string; closed: WordSpot[]; opened: WordSpot[] };

/** No words, or words with a line break of their own, just ride along. */
const ridesAlong = (words: string) => !words || words.includes('\n');

/**
 * The longest a step's words take to glide to their new lines as it opens
 * or closes: 0 if they ride along.
 */
export function wordGlideMs(text: string): number {
  const words = text.trim();
  return ridesAlong(words) ? 0 : glideLength(words.split(/\s+/).length);
}

/**
 * A long step's words gliding to their new lines as it opens or closes
 * (Round 27). The words are measured at rest, ahead of a glide, so it starts
 * with the number and time; if the step opens or closes before that, the old
 * lines hold where they were until they are. A glide keeps the words it
 * started with, and typing ends it at once. Words with a line break of their
 * own, or that keep their lines, just ride along.
 *
 * `glide` goes in the step's text box; while `textHidden`, the step's own
 * text steps aside, unseen (it keeps focus).
 */
export function useWordGlide({
  index,
  open,
  text,
  color,
  closedBoxWidth,
  openedBoxWidth,
  progress,
}: {
  index: number;
  open: boolean;
  text: string;
  color: string;
  /** The text box's width (padding included) with the step closed and open. */
  closedBoxWidth: number;
  openedBoxWidth: number;
  /** The row's open progress, which moves the text box. */
  progress: SharedValue<number>;
}): { glide: ReactNode; textHidden: boolean } {
  const words = text.trim();
  // Lines grow with Android's font size; a change measures the words again.
  const { fontScale } = useWindowDimensions();
  const linePitch = STEP_WORDS.lineHeight * fontScale;
  const layoutsKey = `${closedBoxWidth}|${openedBoxWidth}|${fontScale}|${words}`;
  const glides = !ridesAlong(words) && !!closedBoxWidth;
  const measured = useRef<Layouts | null>(null);
  const planGlide = (target: 0 | 1, { closed, opened }: Layouts) =>
    target === 1
      ? makeGlide({ before: closed, after: opened }, OPEN_BOX_SHIFT, linePitch)
      : makeGlide({ before: opened, after: closed }, -OPEN_BOX_SHIFT, linePitch);
  // Without its plan, a glide holds the old lines while the words are measured.
  const [glide, setGlide] = useState<{ id: number; target: 0 | 1; text: string; plan?: Glide } | null>(null);
  const glideCount = useRef(0);
  // The glide starts in the very render where the step opens or closes, so no
  // frame shows the step's own text re-split before it.
  const [glideFor, setGlideFor] = useState(open);
  if (open !== glideFor) {
    setGlideFor(open);
    glideCount.current += 1;
    const target = open ? 1 : 0;
    const ready = measured.current?.key === layoutsKey ? measured.current : null;
    const plan = ready ? planGlide(target, ready) : undefined;
    setGlide(!glides || plan === null ? null : { id: glideCount.current, target, text, plan });
  } else if (glide && glide.text !== text) {
    setGlide(null);
  }
  const onMeasured = (closed: WordSpot[], opened: WordSpot[]) => {
    const layouts = { key: layoutsKey, closed, opened };
    measured.current = layouts;
    setGlide((current) => {
      if (!current || current.plan) return current;
      const plan = planGlide(current.target, layouts);
      return plan ? { ...current, plan } : null;
    });
  };

  const travel = glide ? { progress, target: glide.target, openShift: OPEN_BOX_SHIFT } : null;
  return {
    textHidden: !!glide,
    glide: (
      <>
        {/* Mounted while the layouts stay the same, glides included, so the
            words are measured once for them. */}
        {glides ? (
          <WordLayouts
            key={layoutsKey}
            index={index}
            text={words}
            widths={[closedBoxWidth, openedBoxWidth]}
            names={['closed', 'opened']}
            onMeasured={onMeasured}
          />
        ) : null}
        {glide?.plan && travel ? (
          <WordGlide
            key={glide.id}
            index={index}
            text={glide.text}
            color={color}
            glide={glide.plan}
            width={glide.target === 1 ? openedBoxWidth : closedBoxWidth}
            travel={travel}
            onDone={() => setGlide(null)}
          />
        ) : glide && travel ? (
          <HeldWords
            index={index}
            text={glide.text}
            color={color}
            width={glide.target === 1 ? closedBoxWidth : openedBoxWidth}
            travel={travel}
          />
        ) : null}
      </>
    ),
  };
}
