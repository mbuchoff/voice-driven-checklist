import { useEffect } from 'react';
import { Modal, View } from 'react-native';
import Animated, { cancelAnimation, Easing, interpolate, useDerivedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { Palette } from '@/src/theme/palette';

import { getRoutineCardColors, RoutineCard } from './RoutineCard';
import { RoutineHoldOutline } from './RoutineHoldOutline';
import { getRoutinePosition, type RoutineGridMetrics } from './routineGrid';
import type { LibraryChecklist } from './types';

export const ROUTINE_ARRANGE_LESSON_DURATION_MS = 2700;

export function RoutineArrangeLesson({
  item,
  layout,
  viewportOrigin,
  theme,
  onFinish,
}: {
  item: LibraryChecklist;
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
  const outlineProgress = useDerivedValue(() =>
    interpolate(progress.value, [0, 0.18, 0.4, 1], [0, 0, 1, 1]),
  );

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
          <RoutineHoldOutline
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
