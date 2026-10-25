import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/src/components/Icon';

import type { EditorColors } from '../editorColors';
import { formatTimerLong, formatTimerWords } from '../timerFormat';
import { fitChips } from '../timers';
import { CHIP_FOLD_MS, CSS_EASE } from '../motion';
import { CHIP_STRIP_INSET } from './stepRowMetrics';

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

/** How wide each time's chip is in the step strip and in the timer panel. */
export type ChipWidths = {
  strip: Record<number, number>;
  /** The strip's "No timer". */
  noTimer: number;
  panel: Record<number, number>;
};

/**
 * Measures, once for the whole editor, each of `times`' chips in both looks
 * and "No timer": a time's chip is as wide whichever step or set it's in.
 * Render `measurer` once, anywhere.
 */
export function useChipWidths(colors: EditorColors, times: readonly number[]) {
  const [widths, setWidths] = useState<ChipWidths>({ strip: {}, noTimer: 0, panel: {} });
  const distinct = [...new Set(times)].sort((a, b) => a - b);
  const measure = (look: 'strip' | 'panel', time: number) => (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setWidths((current) =>
      current[look][time] === width ? current : { ...current, [look]: { ...current[look], [time]: width } });
  };
  const measurer = (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', opacity: 0, top: 0, left: 0 }}
    >
      <View style={{ flexDirection: 'row' }}>
        {distinct.map((time) => (
          <View key={time} testID={`chip-measure-${time}`} onLayout={measure('strip', time)}>
            <Chip colors={colors} look={STRIP_LOOK} seconds={time} checked={false} />
          </View>
        ))}
        <View
          testID="chip-measure-none"
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            setWidths((current) => (current.noTimer === width ? current : { ...current, noTimer: width }));
          }}
        >
          <Chip colors={colors} look={STRIP_LOOK} seconds={null} checked={false} />
        </View>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {distinct.map((time) => (
          <View key={time} testID={`panel-chip-measure-${time}`} onLayout={measure('panel', time)}>
            <Chip colors={colors} look={PANEL_LOOK} seconds={time} checked={false} />
          </View>
        ))}
      </View>
    </View>
  );
  return { widths, measurer };
}

/**
 * The candidates whose chips fit on one line in `room` (see fitChips), or
 * null until every one has been measured.
 */
function fittedChips(
  candidates: readonly number[],
  widths: Record<number, number>,
  room: number,
  look: ChipLook,
  moreWidth: number,
): number[] | null {
  if (room <= 0 || candidates.some((time) => widths[time] == null)) return null;
  return fitChips(candidates, (time) => widths[time], room, look.gap, moreWidth);
}

/** An open step's timer chips, folded open under its words. */
export function StepTimerChips({
  colors,
  open,
  candidates,
  widths,
  room,
  selected,
  stepNumber,
  onPick,
  onMore,
  index,
}: {
  colors: EditorColors;
  open: boolean;
  /** The open step's times (fixed while it's open). */
  candidates: readonly number[];
  widths: ChipWidths;
  /** The strip's room for "No timer", the times and ⋯. */
  room: number;
  selected: number | null;
  stepNumber: number;
  onPick: (seconds: number | null) => void;
  onMore: () => void;
  index: number;
}) {
  const times = useMemo(
    () => (widths.noTimer > 0
      ? fittedChips(candidates, widths.strip, room - widths.noTimer - STRIP_LOOK.gap, STRIP_LOOK, MORE_WIDTH)
      : null),
    [candidates, room, widths],
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
    height.value = withTiming(shown ? contentHeight : 0, { duration: CHIP_FOLD_MS, easing: CSS_EASE });
  }, [contentHeight, height, shown]);
  const foldStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View
      style={[{ overflow: 'hidden' }, foldStyle]}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
    >
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
        <View
          testID={shown ? `step-chips-${index}` : undefined}
          accessibilityRole="radiogroup"
          accessibilityLabel={`Timer for step ${stepNumber}`}
          onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}
          style={{
            paddingTop: 8,
            paddingBottom: 6,
            paddingLeft: CHIP_STRIP_INSET,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: STRIP_LOOK.gap,
          }}
        >
          <Chip
            testID={`step-chip-${index}-none`}
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
              testID={`step-chip-${index}-${time}`}
              colors={colors}
              look={STRIP_LOOK}
              seconds={time}
              checked={selected === time}
              grow
              onPress={() => onPick(time)}
            />
          ))}
          <Pressable
            testID={`step-more-${index}`}
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
    </Animated.View>
  );
}

/** The timer panel's quick picks: the same candidates, bigger, no ⋯. */
export function PanelQuickPicks({
  colors,
  candidates,
  widths,
  selected,
  onPick,
}: {
  colors: EditorColors;
  candidates: readonly number[];
  /** The panel look's widths (ChipWidths.panel). */
  widths: Record<number, number>;
  selected: number | null;
  onPick: (seconds: number) => void;
}) {
  const [room, setRoom] = useState(0);
  const times = useMemo(() => fittedChips(candidates, widths, room, PANEL_LOOK, 0), [candidates, room, widths]);
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
    </View>
  );
}
