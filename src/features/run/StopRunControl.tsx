import {
  Pressable,
  Text,
  type NativePointerEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { Icon } from '@/src/components/Icon';
import type { Palette } from '@/src/theme/palette';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const STOP_CONTROL_REST_SIZE = 44;
const STOP_CONTROL_MIN_HELD_SIZE = 66;
const STOP_CONTROL_MAX_HELD_SIZE = 108;
const STOP_CONTROL_CONTACT_PADDING = 24;
const STOP_CONTROL_RETURN_MS = 140;

export function getHeldStopControlSize(width: number, height: number) {
  'worklet';
  return Math.min(
    STOP_CONTROL_MAX_HELD_SIZE,
    Math.max(
      STOP_CONTROL_MIN_HELD_SIZE,
      Math.max(width, height) + STOP_CONTROL_CONTACT_PADDING,
    ),
  );
}

export function applyHeldStopControlSizeIfActive(
  size: Pick<SharedValue<number>, 'value'>,
  holdActive: Pick<SharedValue<boolean>, 'value'>,
  width: number,
  height: number,
) {
  'worklet';
  if (!holdActive.value) return false;
  size.value = getHeldStopControlSize(width, height);
  return true;
}

export function getStopControlPosition(
  size: number,
  pointerX: number,
  pointerY: number,
) {
  'worklet';
  return {
    left: pointerX - size / 2,
    top: pointerY - size / 2,
  };
}

export function StopRunControl({
  theme,
  talkBackEnabled,
  holdingStop,
  stopHoldProgress,
  onBeginStopHold,
  onReleaseStopHold,
  onRequestStop,
}: {
  theme: Palette;
  talkBackEnabled: boolean;
  holdingStop: boolean;
  stopHoldProgress: SharedValue<number>;
  onBeginStopHold: () => void;
  onReleaseStopHold: () => void;
  onRequestStop: () => void | Promise<void>;
}) {
  const stopControlSize = useSharedValue(STOP_CONTROL_REST_SIZE);
  const stopGestureActive = useSharedValue(false);
  const pointerX = useSharedValue(STOP_CONTROL_REST_SIZE / 2);
  const pointerY = useSharedValue(STOP_CONTROL_REST_SIZE / 2);
  const stopControlPositionStyle = useAnimatedStyle(() =>
    getStopControlPosition(
      stopControlSize.value,
      pointerX.value,
      pointerY.value,
    ),
  );
  const stopControlSizeStyle = useAnimatedStyle(() => ({
    width: stopControlSize.value,
    height: stopControlSize.value,
    borderRadius: stopControlSize.value / 2,
  }));

  const sizeForPointerContact = (
    event: NativeSyntheticEvent<NativePointerEvent>,
  ) => {
    if (talkBackEnabled) return;
    const { width, height } = event.nativeEvent;
    scheduleOnUI(
      applyHeldStopControlSizeIfActive,
      stopControlSize,
      stopGestureActive,
      width,
      height,
    );
  };

  const stopGesture = Gesture.Pan()
    .withTestId('stop-hold-gesture')
    .enabled(!talkBackEnabled)
    .minDistance(0)
    .maxPointers(1)
    .shouldCancelWhenOutside(false)
    .onBegin((event) => {
      'worklet';
      stopGestureActive.value = true;
      stopControlSize.value = Math.max(
        stopControlSize.value,
        STOP_CONTROL_MIN_HELD_SIZE,
      );
      pointerX.value = event.x;
      pointerY.value = event.y;
      scheduleOnRN(onBeginStopHold);
    })
    .onUpdate((event) => {
      'worklet';
      pointerX.value = event.x;
      pointerY.value = event.y;
    })
    .onFinalize(() => {
      'worklet';
      stopGestureActive.value = false;
      const timing = { duration: STOP_CONTROL_RETURN_MS };
      stopControlSize.value = withTiming(STOP_CONTROL_REST_SIZE, timing);
      pointerX.value = withTiming(STOP_CONTROL_REST_SIZE / 2, timing);
      pointerY.value = withTiming(STOP_CONTROL_REST_SIZE / 2, timing);
      scheduleOnRN(onReleaseStopHold);
    });

  return (
    <GestureDetector gesture={stopGesture}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Stop run"
        accessibilityHint={
          talkBackEnabled
            ? 'Opens a confirmation dialog'
            : 'Press and hold for one point two seconds'
        }
        testID="stop-run"
        onPointerDown={sizeForPointerContact}
        onPress={() => {
          if (talkBackEnabled) void onRequestStop();
        }}
        style={{
          width: STOP_CONTROL_REST_SIZE,
          height: STOP_CONTROL_REST_SIZE,
          overflow: 'visible',
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            },
            stopControlPositionStyle,
          ]}
        >
          <Animated.View
            testID="stop-hold-control"
            style={[
              {
                width: STOP_CONTROL_REST_SIZE,
                height: STOP_CONTROL_REST_SIZE,
                borderRadius: STOP_CONTROL_REST_SIZE / 2,
                borderWidth: 1,
                borderColor: theme.runBorder,
                backgroundColor: theme.runSurface,
                alignItems: 'center',
                justifyContent: 'center',
              },
              stopControlSizeStyle,
            ]}
          >
            <HoldProgressRing
              progress={stopHoldProgress}
              color={theme.accent}
              trackColor={theme.runBorder}
            />
            <Icon
              name="close"
              color={theme.runText}
              size={holdingStop ? 26 : 20}
              testID="stop-run-icon"
            />
          </Animated.View>
          {holdingStop ? (
            <Text
              numberOfLines={1}
              style={{
                color: '#17382e',
                backgroundColor: theme.accent,
                borderRadius: 9,
                paddingHorizontal: 12,
                paddingVertical: 6,
                fontWeight: '800',
                fontSize: 12,
                lineHeight: 16,
              }}
            >
              Keep holding
            </Text>
          ) : null}
        </Animated.View>
      </Pressable>
    </GestureDetector>
  );
}

function HoldProgressRing({
  progress,
  color,
  trackColor,
}: {
  progress: SharedValue<number>;
  color: string;
  trackColor: string;
}) {
  const circumference = 2 * Math.PI * 24;
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', top: -4, right: -4, bottom: -4, left: -4 }}
    >
      <Svg testID="stop-progress-arc" width="100%" height="100%" viewBox="0 0 52 52">
        <Circle
          cx="26"
          cy="26"
          r="24"
          fill="none"
          stroke={trackColor}
          strokeWidth="3"
        />
        <AnimatedCircle
          animatedProps={animatedProps}
          cx="26"
          cy="26"
          r="24"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeLinecap="round"
          rotation={-90}
          origin="26, 26"
        />
      </Svg>
    </Animated.View>
  );
}
