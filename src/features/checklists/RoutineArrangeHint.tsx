import { useCallback, useEffect } from 'react';
import {
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon } from '@/src/components/Icon';
import type { Palette } from '@/src/theme/palette';

import { getRoutineCardColors, RoutineCard } from './RoutineCard';
import {
  getRoutinePosition,
  type RoutineGridMetrics,
} from './routineGrid';
import type { ChecklistSummary } from './types';

export const ROUTINE_ARRANGE_SWIPE_DISTANCE = 72;
export const ROUTINE_ARRANGE_LESSON_DURATION_MS = 2700;

const HINT_SWIPE_SLOP = 8;
const HINT_DISMISS_DURATION_MS = 160;
const AnimatedPath = Animated.createAnimatedComponent(Path);

export function shouldShowRoutineArrangeHint(
  routineCount: number,
  dismissed: boolean,
) {
  return routineCount >= 2 && !dismissed;
}

export function RoutineArrangeHint({
  theme,
  onOpenLesson,
  onDismiss,
}: {
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
    arrowProgress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 850, easing: Easing.out(Easing.quad) }),
        withDelay(750, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(arrowProgress);
  }, [arrowProgress]);

  const resetHint = useCallback(() => {
    offsetX.value = withTiming(0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
    opacity.value = withTiming(1, { duration: 120 });
  }, [offsetX, opacity]);

  const persistDismissal = useCallback(
    async (_direction: number) => {
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
    .onEnd((event) => {
      'worklet';
      if (Math.abs(event.translationX) < ROUTINE_ARRANGE_SWIPE_DISTANCE) {
        offsetX.value = withTiming(0, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
        });
        opacity.value = withTiming(1, { duration: 120 });
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
          if (finished) scheduleOnRN(persistDismissal, direction);
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
    void persistDismissal(1);
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

export function RoutineArrangeLesson({
  item,
  layout,
  viewportOrigin,
  theme,
  onFinish,
}: {
  item: ChecklistSummary;
  layout: RoutineGridMetrics;
  viewportOrigin: { x: number; y: number };
  theme: Palette;
  onFinish: () => void;
}) {
  const progress = useSharedValue(0);
  const source = getRoutinePosition(0, layout);
  const destination = getRoutinePosition(1, layout);
  const movement = {
    x: destination.x - source.x,
    y: destination.y - source.y,
  };
  const { ink } = getRoutineCardColors(item.id, theme.mode);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: ROUTINE_ARRANGE_LESSON_DURATION_MS,
      easing: Easing.linear,
    });
    const timer = setTimeout(onFinish, ROUTINE_ARRANGE_LESSON_DURATION_MS);
    return () => {
      clearTimeout(timer);
      cancelAnimation(progress);
    };
  }, [onFinish, progress]);

  const dimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 0.08, 0.88, 1],
      [0, 0.68, 0.68, 0],
    ),
  }));
  const destinationStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 0.36, 0.48, 0.88, 1],
      [0, 0, 0.86, 0.86, 0],
    ),
  }));
  const sourceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 0.08, 0.88, 1],
      [0, 1, 1, 0],
    ),
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 0.38, 0.52, 0.76, 0.88, 1],
          [0, 0, 0, movement.x, movement.x, movement.x],
        ),
      },
      {
        translateY: interpolate(
          progress.value,
          [0, 0.38, 0.52, 0.76, 0.88, 1],
          [0, 0, 0, movement.y, movement.y, movement.y],
        ),
      },
      {
        scale: interpolate(
          progress.value,
          [0, 0.2, 0.4, 0.88, 1],
          [1, 1, 1.045, 1.045, 1],
        ),
      },
    ],
  }));
  const touchStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 0.08, 0.16, 0.88, 1],
      [0, 0, 1, 1, 0],
    ),
    transform: [
      {
        scale: interpolate(
          progress.value,
          [0, 0.12, 0.22, 0.4, 0.88, 1],
          [1.35, 1.35, 1, 0.88, 0.88, 1.1],
        ),
      },
    ],
  }));
  const outlineProgress = useSharedValue(0);

  useEffect(() => {
    outlineProgress.value = withDelay(
      ROUTINE_ARRANGE_LESSON_DURATION_MS * 0.18,
      withTiming(1, {
        duration: ROUTINE_ARRANGE_LESSON_DURATION_MS * 0.22,
        easing: Easing.linear,
      }),
    );
    return () => cancelAnimation(outlineProgress);
  }, [outlineProgress]);

  return (
    <Modal
      testID="routine-arrange-lesson-modal"
      visible
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onFinish}
    >
      <View
        testID="routine-arrange-lesson"
        accessible
        accessibilityViewIsModal
        accessibilityLabel="Demonstrating how to move a routine"
        pointerEvents="auto"
        style={{ flex: 1 }}
      >
        <Animated.View
          testID="routine-arrange-lesson-dimmer"
          style={[
            {
              position: 'absolute',
              inset: 0,
              backgroundColor: '#101814',
            },
            dimmerStyle,
          ]}
        />
        <Animated.View
          testID="routine-arrange-lesson-destination"
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: viewportOrigin.x + destination.x,
              top: viewportOrigin.y + destination.y,
              width: layout.cardWidth,
              height: layout.cardHeight,
              borderRadius: 22,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: theme.primary,
              backgroundColor: theme.surfaceSoft,
            },
            destinationStyle,
          ]}
        />
        <Animated.View
          testID="routine-arrange-lesson-source"
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          style={[
            {
              position: 'absolute',
              left: viewportOrigin.x + source.x,
              top: viewportOrigin.y + source.y,
              width: layout.cardWidth,
              height: layout.cardHeight,
              borderRadius: 22,
              boxShadow: `0 18px 34px ${theme.shadow}`,
            },
            sourceStyle,
          ]}
        >
          <RoutineCard
            item={item}
            layout={layout}
            theme={theme}
            onEdit={() => undefined}
            onStart={() => undefined}
          />
          <RoutineLessonProgress
            width={layout.cardWidth}
            height={layout.cardHeight}
            color={ink}
            progress={outlineProgress}
          />
          <Animated.View
            testID="routine-arrange-lesson-touch"
            style={[
              {
                position: 'absolute',
                left: layout.cardWidth / 2 - 23,
                top: layout.cardHeight / 2 - 23,
                width: 46,
                height: 46,
                borderRadius: 23,
                borderWidth: 2,
                borderColor: theme.onPrimary,
                backgroundColor: theme.primary,
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 5px 16px ${theme.shadow}`,
              },
              touchStyle,
            ]}
          >
            <View
              style={{
                width: 13,
                height: 13,
                borderRadius: 7,
                backgroundColor: theme.onPrimary,
              }}
            />
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function RoutineLessonProgress({
  width,
  height,
  color,
  progress,
}: {
  width: number;
  height: number;
  color: string;
  progress: SharedValue<number>;
}) {
  const inset = 4;
  const radius = 18;
  const right = width - inset;
  const bottom = height - inset;
  const pathWidth = right - inset;
  const pathHeight = bottom - inset;
  const perimeter =
    2 * (pathWidth + pathHeight - 4 * radius) + 2 * Math.PI * radius;
  const outline = [
    `M ${width / 2} ${inset}`,
    `H ${right - radius}`,
    `A ${radius} ${radius} 0 0 1 ${right} ${inset + radius}`,
    `V ${bottom - radius}`,
    `A ${radius} ${radius} 0 0 1 ${right - radius} ${bottom}`,
    `H ${inset + radius}`,
    `A ${radius} ${radius} 0 0 1 ${inset} ${bottom - radius}`,
    `V ${inset + radius}`,
    `A ${radius} ${radius} 0 0 1 ${inset + radius} ${inset}`,
    `H ${width / 2}`,
    'Z',
  ].join(' ');
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: perimeter * (1 - progress.value),
  }));

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', inset: 0, zIndex: 4 }}
    >
      <View
        style={{
          position: 'absolute',
          inset: 2,
          borderRadius: 20,
          backgroundColor: color,
          opacity: 0.12,
        }}
      />
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
        <Path
          d={outline}
          fill="none"
          stroke={color}
          strokeOpacity={0.18}
          strokeWidth={5}
        />
        <AnimatedPath
          animatedProps={animatedProps}
          d={outline}
          fill="none"
          stroke={color}
          strokeOpacity={0.82}
          strokeWidth={5}
          strokeDasharray={`${perimeter} ${perimeter}`}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
