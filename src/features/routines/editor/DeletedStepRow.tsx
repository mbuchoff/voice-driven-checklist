import { useEffect, useRef } from 'react';
import { Pressable, Text } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { EditorColors } from '../editorColors';
import { useUndoTimeout } from '../useUndoTimeout';
import { CSS_EASE } from '../motion';

/** A swiped-away step's UNDO stays this long (longer if TalkBack asks). */
export const STEP_UNDO_MS = 5000;
const CLOSE_UP_MS = 260;

/**
 * The place a swiped-away step leaves, with UNDO, at the step's height. It
 * keeps its UNDO for STEP_UNDO_MS, closes up, then reports it's gone;
 * going away sooner (UNDO, a drag) cancels all of that.
 */
export function DeletedStepRow({
  colors,
  height,
  first,
  onUndo,
  onExpired,
  index,
}: {
  colors: EditorColors;
  height: number;
  first: boolean;
  onUndo: () => void;
  onExpired: () => void;
  index: number;
}) {
  const progress = useSharedValue(1);
  const mounted = useRef(true);
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;
  const expire = () => {
    if (mounted.current) onExpiredRef.current();
  };
  useEffect(() => () => {
    mounted.current = false;
    cancelAnimation(progress);
  }, [progress]);
  useUndoTimeout(STEP_UNDO_MS, () => {
    progress.value = withTiming(0, { duration: CLOSE_UP_MS, easing: CSS_EASE }, (finished) => {
      if (finished) scheduleOnRN(expire);
    });
  });
  const style = useAnimatedStyle(() => ({
    height: Math.max(52, height) * progress.value,
    opacity: progress.value,
  }));
  return (
    <Animated.View
      testID={`deleted-step-${index}`}
      accessibilityLiveRegion="polite"
      style={[
        {
          overflow: 'hidden',
          borderTopWidth: first ? 0 : 1,
          borderTopColor: colors.divider,
          backgroundColor: colors.surfaceSoft,
          paddingLeft: 16,
          paddingRight: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        style,
      ]}
    >
      <Text style={{ flex: 1, color: colors.muted, fontSize: 14 }}>Step deleted</Text>
      <Pressable
        testID={`undo-step-${index}`}
        accessibilityRole="button"
        accessibilityLabel="Undo deleting this step"
        onPress={onUndo}
        style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '800', letterSpacing: 0.3 }}>
          UNDO
        </Text>
      </Pressable>
    </Animated.View>
  );
}
