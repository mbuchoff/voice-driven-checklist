import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/src/components/Icon';

import type { EditorColors } from '../editorColors';
import { fitChips, formatTimerLong, formatTimerWords } from '../timers';

type ChipLook = {
  minHeight: number;
  paddingHorizontal: number;
  fontSize: number;
  gap: number;
};

/**
 * The step's chips: "No timer", then the times, stretching to fill their line,
 * with a ⋯ at the end.
 */
const STRIP_LOOK: ChipLook = { minHeight: 44, paddingHorizontal: 6, fontSize: 16, gap: 4 };
/** The timer panel's quick picks: centered, no ⋯. */
const PANEL_LOOK: ChipLook = { minHeight: 44, paddingHorizontal: 10, fontSize: 17, gap: 6 };
const MORE_WIDTH = 44;
const FOLD_MS = 220;
/** The strip's chips line up with the open step's words (inset 18 − 8). */
const STRIP_INSET = 10;

function Chip({
  colors,
  look,
  seconds,
  checked,
  grow,
  onPress,
  testID,
}: {
  colors: EditorColors;
  look: ChipLook;
  /** A time, or null for "No timer". */
  seconds: number | null;
  checked: boolean;
  /** Takes a share of the line's spare width. */
  grow?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={seconds ? formatTimerWords(seconds) : 'No timer'}
      accessibilityState={{ checked }}
      onPress={onPress}
      style={{
        flexGrow: grow ? 1 : 0,
        minHeight: look.minHeight,
        paddingHorizontal: look.paddingHorizontal,
        borderWidth: 1,
        borderColor: checked ? colors.ink : colors.border,
        borderRadius: look.minHeight / 2,
        backgroundColor: checked ? colors.fill : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        numberOfLines={1}
        style={{ color: checked ? colors.ink : colors.text, fontSize: look.fontSize, fontWeight: '700' }}
      >
        {seconds ? formatTimerLong(seconds) : 'No timer'}
      </Text>
    </Pressable>
  );
}

/**
 * Lays out candidate chips on one line: measures each chip and the room,
 * then keeps as many as fit (see fitChips). `candidates` should stay the
 * same array while the chips are showing, so the set doesn't change under
 * the finger. With `noTimer`, a "No timer" chip shares the line.
 */
function useFittedChips(
  candidates: number[],
  look: ChipLook,
  moreWidth: number,
  measureId: string,
  noTimer = false,
) {
  // Widths are kept by time: a time's chip is as wide whichever set it's in,
  // and a chip that stays on screen isn't laid out (or measured) again.
  const [widths, setWidths] = useState<Record<number, number>>({});
  const [noTimerWidth, setNoTimerWidth] = useState(0);
  const [room, setRoom] = useState(0);
  const measured = candidates.every((time) => widths[time] != null) && room > 0
    && (!noTimer || noTimerWidth > 0);
  const times = useMemo(
    () =>
      measured
        ? fitChips(
          candidates,
          (time) => widths[time],
          noTimer ? room - noTimerWidth - look.gap : room,
          look.gap,
          moreWidth,
        )
        : null,
    [candidates, look.gap, measured, moreWidth, noTimer, noTimerWidth, room, widths],
  );
  const measurer = (colors: EditorColors) => (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', opacity: 0, flexDirection: 'row', top: 0, left: 0 }}
    >
      {candidates.map((time) => (
        <View
          key={time}
          testID={`${measureId}-${time}`}
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            setWidths((current) => (current[time] === width ? current : { ...current, [time]: width }));
          }}
        >
          <Chip colors={colors} look={look} seconds={time} checked={false} />
        </View>
      ))}
      {noTimer ? (
        <View
          testID={`${measureId}-none`}
          onLayout={(event) => setNoTimerWidth(event.nativeEvent.layout.width)}
        >
          <Chip colors={colors} look={look} seconds={null} checked={false} />
        </View>
      ) : null}
    </View>
  );
  return { times, measurer, setRoom };
}

/** An open step's timer chips, folded open under its words. */
export function StepTimerChips({
  colors,
  open,
  candidates,
  selected,
  stepNumber,
  onPick,
  onMore,
  index,
}: {
  colors: EditorColors;
  open: boolean;
  candidates: number[];
  selected: number | null;
  stepNumber: number;
  onPick: (seconds: number | null) => void;
  onMore: () => void;
  index: number;
}) {
  const { times, measurer, setRoom } = useFittedChips(
    candidates, STRIP_LOOK, MORE_WIDTH, `chip-measure-${index}`, true,
  );
  const [contentHeight, setContentHeight] = useState(0);
  const height = useSharedValue(0);
  const shown = open && times !== null;
  // The times on show stay while the strip folds, so they fold away with ⋯
  // instead of vanishing the moment it starts to close.
  const [foldingTimes, setFoldingTimes] = useState<number[]>([]);
  useEffect(() => {
    if (shown && times) setFoldingTimes(times);
  }, [shown, times]);
  const visibleTimes = shown ? times : foldingTimes;
  useEffect(() => {
    height.value = withTiming(shown ? contentHeight : 0, { duration: FOLD_MS, easing: Easing.ease });
  }, [contentHeight, height, shown]);
  const foldStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View
      style={[{ overflow: 'hidden' }, foldStyle]}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
    >
      <View
        testID={`chips-room-${index}`}
        onLayout={(event) => setRoom(event.nativeEvent.layout.width - STRIP_INSET)}
        style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
      >
        <View
          testID={shown ? `item-chips-${index}` : undefined}
          accessibilityRole="radiogroup"
          accessibilityLabel={`Timer for step ${stepNumber}`}
          onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}
          style={{
            paddingTop: 8,
            paddingBottom: 6,
            paddingLeft: STRIP_INSET,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: STRIP_LOOK.gap,
          }}
        >
          <Chip
            testID={`item-chip-${index}-none`}
            colors={colors}
            look={STRIP_LOOK}
            seconds={null}
            checked={!selected}
            grow
            onPress={() => onPick(null)}
          />
          {(visibleTimes ?? []).map((time) => (
            <Chip
              key={time}
              testID={`item-chip-${index}-${time}`}
              colors={colors}
              look={STRIP_LOOK}
              seconds={time}
              checked={selected === time}
              grow
              onPress={() => onPick(time)}
            />
          ))}
          <Pressable
            testID={`item-more-${index}`}
            accessibilityRole="button"
            accessibilityLabel="More timer lengths"
            onPress={onMore}
            style={{
              width: MORE_WIDTH,
              minHeight: STRIP_LOOK.minHeight,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: STRIP_LOOK.minHeight / 2,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="more" color={colors.text} size={20} />
          </Pressable>
        </View>
      </View>
      {measurer(colors)}
    </Animated.View>
  );
}

/** The timer panel's quick picks: the same candidates, bigger, no ⋯. */
export function PanelQuickPicks({
  colors,
  candidates,
  selected,
  onPick,
}: {
  colors: EditorColors;
  candidates: number[];
  selected: number | null;
  onPick: (seconds: number) => void;
}) {
  const { times, measurer, setRoom } = useFittedChips(
    candidates, PANEL_LOOK, 0, 'panel-chip-measure',
  );
  return (
    <View testID="panel-chips-room" onLayout={(event) => setRoom(event.nativeEvent.layout.width)}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Quick timer lengths"
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: PANEL_LOOK.gap,
          paddingTop: 6,
          paddingBottom: 12,
          minHeight: PANEL_LOOK.minHeight + 18,
        }}
      >
        {(times ?? []).map((time) => (
          <Chip
            key={time}
            testID={`panel-chip-${time}`}
            colors={colors}
            look={PANEL_LOOK}
            seconds={time}
            checked={selected === time}
            onPress={() => onPick(time)}
          />
        ))}
      </View>
      {measurer(colors)}
    </View>
  );
}
