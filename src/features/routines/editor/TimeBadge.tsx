import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { Icon } from '@/src/components/Icon';

import type { EditorColors } from '../editorColors';
import { formatTimerLong, formatTimerWords } from '../timerFormat';
import { ROW_GAP, TIME_BADGE_HEIGHT } from './stepRowMetrics';

/** The time badge's look, shared with the hidden copy that measures it. */
const TIME_BADGE = {
  height: TIME_BADGE_HEIGHT,
  paddingHorizontal: 8,
  borderRadius: 20,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
} as const;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A timed step's time, which opens the step like its words. While the step
 * is open it shrinks away toward its right edge, as the number does toward
 * its left, and its place closes up (with the row's gap before it) to give
 * the words its room. Reports its width, which the open step's words gain.
 */
export function TimeBadge({
  colors,
  seconds,
  open,
  stepNumber,
  index,
  progress,
  onPress,
  onWidth,
}: {
  colors: EditorColors;
  seconds: number;
  open: boolean;
  stepNumber: number;
  index: number;
  /** The row's open progress. */
  progress: SharedValue<number>;
  onPress: () => void;
  onWidth: (width: number) => void;
}) {
  const width = useSharedValue(0);
  const reported = useRef(0);
  const slotStyle = useAnimatedStyle(() => ({
    width: width.value > 0 ? width.value * (1 - progress.value) : progress.value > 0 ? 0 : undefined,
    marginLeft: -ROW_GAP * progress.value,
  }));
  const badgeStyle = useAnimatedStyle(() => ({
    width: width.value > 0 ? width.value : undefined,
    opacity: 1 - progress.value,
    transform: [{ scale: 1 - 0.8 * progress.value }],
  }));
  return (
    <Animated.View
      style={[{ height: TIME_BADGE_HEIGHT, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }, slotStyle]}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={(event) => {
          const next = event.nativeEvent.layout.width;
          width.value = next;
          if (Math.abs(next - reported.current) > 0.5) {
            reported.current = next;
            onWidth(next);
          }
        }}
        style={[TIME_BADGE, { position: 'absolute', opacity: 0 }]}
      >
        <TimeLabel colors={colors} seconds={seconds} />
      </View>
      <AnimatedPressable
        testID={`step-clock-${index}`}
        accessibilityRole="button"
        accessibilityLabel={`Timer for step ${stepNumber}: ${formatTimerWords(seconds)}`}
        accessibilityElementsHidden={open}
        importantForAccessibility={open ? 'no-hide-descendants' : 'yes'}
        pointerEvents={open ? 'none' : 'auto'}
        onPress={onPress}
        hitSlop={{ top: 7, bottom: 7 }}
        style={[TIME_BADGE, { flexShrink: 0, backgroundColor: colors.fill, transformOrigin: 'right center' }, badgeStyle]}
      >
        <TimeLabel colors={colors} seconds={seconds} />
      </AnimatedPressable>
    </Animated.View>
  );
}

function TimeLabel({ colors, seconds }: { colors: EditorColors; seconds: number }) {
  return (
    <>
      <Icon name="clock" color={colors.ink} size={15} strokeWidth={2.5} />
      <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: '800' }}>
        {formatTimerLong(seconds)}
      </Text>
    </>
  );
}
