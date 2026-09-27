import { useCallback, useEffect } from 'react';
import {
  AppState,
  Pressable,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon } from '@/src/components/Icon';
import type { Palette } from '@/src/theme/palette';

export const ROUTINE_ARRANGE_SWIPE_DISTANCE = 72;

const HINT_SWIPE_SLOP = 8;
const HINT_DISMISS_DURATION_MS = 160;

export function shouldShowRoutineArrangeHint(
  routineCount: number,
  dismissed: boolean,
) {
  return routineCount >= 2 && !dismissed;
}

export function RoutineArrangeHint({
  active = true,
  theme,
  onOpenLesson,
  onDismiss,
}: {
  active?: boolean;
  theme: Palette;
  onOpenLesson: () => void;
  onDismiss: () => Promise<boolean>;
}) {
  const offsetX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const pressedScale = useSharedValue(1);
  const measuredWidth = useSharedValue(360);
  const arrowProgress = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    const update = (state: AppStateStatus) => {
      if (state !== 'active') {
        cancelAnimation(arrowProgress);
        arrowProgress.value = 0;
        return;
      }
      arrowProgress.value = 0;
      arrowProgress.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 850, easing: Easing.out(Easing.quad) }),
          withDelay(750, withTiming(0, { duration: 0 })),
        ),
        -1,
        false,
      );
    };
    update(AppState.currentState);
    const subscription = AppState.addEventListener('change', update);
    return () => {
      subscription.remove();
      cancelAnimation(arrowProgress);
    };
  }, [active, arrowProgress]);

  const resetHint = useCallback(() => {
    'worklet';
    offsetX.value = withTiming(0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
    opacity.value = withTiming(1, { duration: 120 });
  }, [offsetX, opacity]);

  const persistDismissal = useCallback(
    async () => {
      if (!(await onDismiss())) resetHint();
    },
    [onDismiss, resetHint],
  );

  const swipe = Gesture.Pan()
    .withTestId('routine-arrange-hint-swipe')
    .activeOffsetX([-HINT_SWIPE_SLOP, HINT_SWIPE_SLOP])
    .failOffsetY([-HINT_SWIPE_SLOP, HINT_SWIPE_SLOP])
    .onUpdate((event) => {
      'worklet';
      offsetX.value = event.translationX;
      opacity.value = Math.max(0.35, 1 - Math.abs(event.translationX) / 260);
    })
    .onEnd((event, success) => {
      'worklet';
      if (!success || Math.abs(event.translationX) < ROUTINE_ARRANGE_SWIPE_DISTANCE) {
        resetHint();
        return;
      }
      const direction = event.translationX < 0 ? -1 : 1;
      offsetX.value = withTiming(
        direction * (measuredWidth.value + 48),
        { duration: HINT_DISMISS_DURATION_MS, easing: Easing.in(Easing.quad) },
      );
      opacity.value = withTiming(
        0,
        { duration: 130 },
        (finished) => {
          if (finished) scheduleOnRN(persistDismissal);
        },
      );
    });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: offsetX.value },
      { scale: pressedScale.value },
    ],
  }));
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      arrowProgress.value,
      [0, 0.12, 0.72, 1],
      [0, 0.58, 0.48, 0],
    ),
    transform: [
      {
        translateX: interpolate(
          arrowProgress.value,
          [0, 1],
          [-14, 8],
        ),
      },
    ],
  }));

  const dismissFromAccessibility = () => {
    offsetX.value = withTiming(measuredWidth.value + 48, {
      duration: HINT_DISMISS_DURATION_MS,
    });
    opacity.value = withTiming(0, { duration: 130 });
    void persistDismissal();
  };

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View
        testID="routine-arrange-hint"
        onLayout={(event) => {
          measuredWidth.value = event.nativeEvent.layout.width;
        }}
        style={[
          {
            marginTop: 12,
            paddingVertical: 12,
            paddingLeft: 27,
            paddingRight: 27,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.surfaceAlt,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 11,
            overflow: 'hidden',
          },
          animatedStyle,
        ]}
      >
        <View
          style={{
            minWidth: 44,
            height: 28,
            paddingHorizontal: 8,
            borderRadius: 10,
            backgroundColor: theme.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: theme.onPrimary,
              fontSize: 9,
              fontWeight: '900',
              letterSpacing: 0.8,
            }}
          >
            MOVE
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>
            Hold a routine to move it
          </Text>
          <Text
            style={{
              color: theme.textMuted,
              fontSize: 11,
              lineHeight: 15,
              marginTop: 2,
            }}
          >
            Tap still opens the routine.
          </Text>
        </View>
        <Animated.View
          testID="routine-arrange-hint-right-motion"
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              right: 0,
              top: '50%',
              marginTop: -7,
            },
            arrowStyle,
          ]}
        >
          <Icon
            name="arrowRight"
            color={theme.primary}
            size={14}
            strokeWidth={2.5}
          />
        </Animated.View>
        <Pressable
          testID="routine-arrange-hint-action"
          accessibilityRole="button"
          accessibilityLabel="Learn how to move routines"
          accessibilityHint="Shows a short arrangement demonstration. Swipe to dismiss this tip."
          accessibilityActions={[{ name: 'dismiss', label: 'Dismiss tip' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'dismiss') {
              dismissFromAccessibility();
            }
          }}
          onPressIn={() => {
            pressedScale.value = withTiming(0.985, { duration: 80 });
          }}
          onPressOut={() => {
            pressedScale.value = withTiming(1, { duration: 120 });
          }}
          onPress={onOpenLesson}
          style={{ position: 'absolute', inset: 0 }}
        />
      </Animated.View>
    </GestureDetector>
  );
}
