import { useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** A swipe starts after this much mostly-sideways movement. */
const SWIPE_START = 8;
/** Released past this share of the row's width, a swiped step is deleted. */
export const SWIPE_DELETE_SHARE = 0.4;
/** How fast a released row slides back, or flies off. */
const SWIPE_MS = 200;

/**
 * Swipe-to-delete for a closed step. The row follows the finger, locked to
 * the first direction it moves; let go past 40% of its width, it flies off
 * and is deleted (with its height, which its UNDO keeps); otherwise, or if
 * the swipe is cancelled, it slides back.
 */
export function useStepSwipe({
  testId,
  enabled,
  onDelete,
}: {
  testId: string;
  enabled: boolean;
  onDelete: (height: number) => void;
}) {
  const rowWidth = useSharedValue(0);
  const rowHeight = useRef(0);
  const translateX = useSharedValue(0);
  const direction = useSharedValue(0);
  const deleteRow = () => onDelete(rowHeight.current);

  const gesture = Gesture.Pan()
    .withTestId(testId)
    .enabled(enabled)
    .activeOffsetX([-SWIPE_START, SWIPE_START])
    .failOffsetY([-SWIPE_START, SWIPE_START])
    .onUpdate((event) => {
      'worklet';
      // Android's first update after the swipe starts reports no movement,
      // so the direction locks on the first update that has some.
      if (direction.value === 0) {
        if (event.translationX === 0) return;
        direction.value = event.translationX < 0 ? -1 : 1;
      }
      // Locked to the first direction: moving back past the start stops at 0.
      const along = event.translationX * direction.value;
      translateX.value = direction.value * Math.min(rowWidth.value, Math.max(0, along));
    })
    .onEnd((_event, success) => {
      'worklet';
      const width = rowWidth.value;
      // A cancelled swipe (an interruption, another gesture) slides back.
      if (success && width > 0 && Math.abs(translateX.value) > width * SWIPE_DELETE_SHARE) {
        translateX.value = withTiming(direction.value * (width + 40), { duration: SWIPE_MS }, (finished) => {
          if (finished) scheduleOnRN(deleteRow);
        });
      } else {
        translateX.value = withTiming(0, { duration: SWIPE_MS });
      }
    })
    .onFinalize(() => {
      'worklet';
      direction.value = 0;
    });

  const frontStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  // "Delete" shows on the side the row moves away from.
  const leftSide = useAnimatedStyle(() => ({ opacity: translateX.value > 0 ? 1 : 0 }));
  const rightSide = useAnimatedStyle(() => ({ opacity: translateX.value < 0 ? 1 : 0 }));

  return {
    gesture,
    /** The row's front, which moves with the finger. */
    frontStyle,
    leftSide,
    rightSide,
    /** The row's size, from its layout. */
    measure: (event: LayoutChangeEvent) => {
      rowHeight.current = event.nativeEvent.layout.height;
      rowWidth.value = event.nativeEvent.layout.width;
    },
    /** Deletes the step at once (TalkBack's delete action). */
    deleteRow,
  };
}
