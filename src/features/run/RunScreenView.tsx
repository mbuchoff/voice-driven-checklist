import { memo, useEffect, useRef } from 'react';
import {
  Pressable,
  Text,
  View,
  type NativePointerEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Icon, type IconName } from '@/src/components/Icon';
import { ScreenBackground } from '@/src/components/ScreenBackground';
import type { Palette } from '@/src/theme/palette';

import {
  RUN_ITEM_GAP,
  RUN_TRANSITION_CONFIG,
  getRunItemPresentation,
  getRunItemStatus,
  getRunProgressPalette,
  getRunTrackOffset,
  type RunItemBackgroundStatus,
  type RunItemStatus,
} from './runPresentation';
import type { ChecklistRunState } from './types';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type RunCommand = 'next' | 'previous' | 'repeat';

const STOP_CONTROL_REST_SIZE = 44;
const STOP_CONTROL_MIN_HELD_SIZE = 66;
const STOP_CONTROL_MAX_HELD_SIZE = 108;
const STOP_CONTROL_CONTACT_PADDING = 24;

export function getStopControlPresentation({
  width,
  height,
  offsetX,
  offsetY,
}: Pick<NativePointerEvent, 'width' | 'height' | 'offsetX' | 'offsetY'>) {
  const size = Math.min(
    STOP_CONTROL_MAX_HELD_SIZE,
    Math.max(
      STOP_CONTROL_MIN_HELD_SIZE,
      Math.max(width, height) + STOP_CONTROL_CONTACT_PADDING,
    ),
  );
  return {
    size,
    left: offsetX - size / 2,
    top: offsetY - size / 2,
  };
}

export function CompletionView({
  totalItems,
  checklistTitle,
  onRestart,
  onExit,
}: {
  totalItems: number;
  checklistTitle?: string;
  onRestart: () => void;
  onExit: () => void | Promise<void>;
}) {
  return (
    <View
      testID="completion-screen"
      style={{ flex: 1, overflow: 'hidden', backgroundColor: '#173d31' }}
    >
      <ScreenBackground variant="completion" />
      <CompletionConfetti />
      <SafeAreaView style={{ flex: 1 }}>
      <View
        testID="completion-content"
        style={{
          flex: 1,
          paddingHorizontal: 24,
          paddingVertical: 28,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 96,
            height: 96,
            borderTopLeftRadius: 34,
            borderTopRightRadius: 34,
            borderBottomRightRadius: 34,
            borderBottomLeftRadius: 12,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.25)',
            backgroundColor: '#f3a284',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 30,
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.22)',
          }}
        >
          <Icon name="check" color="#183d31" size={47} strokeWidth={2.5} />
        </View>
        <Text
          style={{
            color: '#f4bca6',
            fontSize: 12,
            fontWeight: '800',
            letterSpacing: 1.56,
            marginBottom: 8,
          }}
        >
          CHECKLIST COMPLETE
        </Text>
        <Text
          style={{
            color: '#fffaf1',
            fontSize: 40,
            lineHeight: 39,
            fontWeight: '700',
            letterSpacing: -2.2,
            marginBottom: 12,
          }}
        >
          Nicely done.
        </Text>
        <Text
          style={{
            color: 'rgba(255, 250, 241, 0.66)',
            fontSize: 16,
            lineHeight: 25,
            textAlign: 'center',
            marginBottom: 36,
          }}
        >
          All {totalItems} steps in “{checklistTitle}” are checked off.
        </Text>
        <View style={{ width: '100%', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            testID="completion-restart"
            onPress={onRestart}
            style={{
              minHeight: 52,
              backgroundColor: '#f3a284',
              borderRadius: 15,
              flexDirection: 'row',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="repeat" color="#173d31" size={18} />
            <Text style={{ color: '#173d31', fontWeight: '700', fontSize: 16 }}>
              Run it again
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="completion-return"
            onPress={onExit}
            style={{
              minHeight: 50,
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.16)',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fffaf1', fontWeight: '700', fontSize: 16 }}>
              Back to my checklists
            </Text>
          </Pressable>
        </View>
      </View>
      </SafeAreaView>
    </View>
  );
}

export function ActiveRunView({
  state,
  theme,
  androidApi,
  talkBackEnabled,
  holdingStop,
  animatedCurrentIndex,
  stopHoldProgress,
  onBeginStopHold,
  onReleaseStopHold,
  onRequestStop,
  onAction,
}: {
  state: ChecklistRunState;
  theme: Palette;
  androidApi: number;
  talkBackEnabled: boolean;
  holdingStop: boolean;
  animatedCurrentIndex: SharedValue<number>;
  stopHoldProgress: SharedValue<number>;
  onBeginStopHold: () => void;
  onReleaseStopHold: () => void;
  onRequestStop: () => void | Promise<void>;
  onAction: (action: RunCommand) => void;
}) {
  const totalItems = state.snapshot?.items.length ?? 0;
  const items = state.snapshot?.items ?? [];
  const progressPalette = getRunProgressPalette(theme.mode);
  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: getRunTrackOffset(animatedCurrentIndex.value) }],
  }));
  const stopPointerId = useRef<number | null>(null);
  const stopControlSize = useSharedValue(STOP_CONTROL_REST_SIZE);
  const stopControlLeft = useSharedValue(0);
  const stopControlTop = useSharedValue(0);
  const stopControlStyle = useAnimatedStyle(() => ({
    width: stopControlSize.value,
    height: stopControlSize.value,
    borderRadius: stopControlSize.value / 2,
    left: stopControlLeft.value,
    top: stopControlTop.value,
  }));
  const stopHintStyle = useAnimatedStyle(() => ({
    left: stopControlLeft.value + stopControlSize.value + 10,
    top: stopControlTop.value + (stopControlSize.value - 28) / 2,
  }));

  const positionStopControl = (
    event: NativeSyntheticEvent<NativePointerEvent>,
  ) => {
    const pointer = event.nativeEvent;
    if (stopPointerId.current !== pointer.pointerId) return;
    const presentation = getStopControlPresentation(pointer);
    stopControlSize.value = presentation.size;
    stopControlLeft.value = presentation.left;
    stopControlTop.value = presentation.top;
  };

  const resetStopControl = () => {
    stopPointerId.current = null;
    const timing = { duration: 140 };
    stopControlSize.value = withTiming(STOP_CONTROL_REST_SIZE, timing);
    stopControlLeft.value = withTiming(0, timing);
    stopControlTop.value = withTiming(0, timing);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.runBackground }}>
      <ScreenBackground variant="run" />
      <RunTexture color={theme.runText} />

      <View
        style={{
          height: 76,
          paddingHorizontal: 20,
          position: 'relative',
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            zIndex: 2,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop run"
            accessibilityHint={
              talkBackEnabled
                ? 'Opens a confirmation dialog'
                : 'Press and hold for one point two seconds'
            }
            testID="stop-run"
            onPointerDown={(event) => {
              if (talkBackEnabled) return;
              stopPointerId.current = event.nativeEvent.pointerId;
              positionStopControl(event);
            }}
            onPointerMove={positionStopControl}
            onPointerUp={resetStopControl}
            onPointerCancel={resetStopControl}
            onPressIn={() => {
              if (!talkBackEnabled && stopPointerId.current == null) {
                stopControlSize.value = STOP_CONTROL_MIN_HELD_SIZE;
                stopControlLeft.value =
                  (STOP_CONTROL_REST_SIZE - STOP_CONTROL_MIN_HELD_SIZE) / 2;
                stopControlTop.value =
                  (STOP_CONTROL_REST_SIZE - STOP_CONTROL_MIN_HELD_SIZE) / 2;
              }
              onBeginStopHold();
            }}
            onPressOut={() => {
              resetStopControl();
              onReleaseStopHold();
            }}
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
              testID="stop-hold-control"
              style={[
                {
                  position: 'absolute',
                  width: STOP_CONTROL_REST_SIZE,
                  height: STOP_CONTROL_REST_SIZE,
                  borderRadius: STOP_CONTROL_REST_SIZE / 2,
                  borderWidth: 1,
                  borderColor: theme.runBorder,
                  backgroundColor: theme.runSurface,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                stopControlStyle,
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
              <Animated.Text
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    color: '#17382e',
                    backgroundColor: theme.accent,
                    borderRadius: 9,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    fontWeight: '800',
                    fontSize: 12,
                    width: 104,
                  },
                  stopHintStyle,
                ]}
              >
                Keep holding
              </Animated.Text>
            ) : null}
          </Pressable>
        </View>
        <View
          pointerEvents="none"
          testID="run-title-frame"
          style={{
            position: 'absolute',
            left: 80,
            right: 80,
            top: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {!holdingStop ? (
            <Text
              numberOfLines={1}
              style={{
                color: theme.runText,
                fontSize: 14,
                fontWeight: '700',
                textAlign: 'center',
                width: '100%',
              }}
            >
              {state.snapshot?.checklistTitle}
            </Text>
          ) : null}
        </View>
      </View>

      <ProgressOrbit
        current={state.currentItemIndex + 1}
        total={totalItems}
        animatedCurrentIndex={animatedCurrentIndex}
        color={theme.runText}
        mutedColor={progressPalette.track}
        accentColor={progressPalette.fill}
        surfaceColor={progressPalette.surface}
        centerBorderColor={progressPalette.centerBorder}
        labelOpacity={progressPalette.labelOpacity}
        shadow={progressPalette.shadow}
      />

      <View testID="run-items-stage" style={{ flex: 1, overflow: 'visible' }}>
        <Animated.View
          testID="run-track"
          style={[
            {
              position: 'absolute',
              top: '42%',
              left: 20,
              right: 20,
            },
            trackStyle,
          ]}
        >
          {items.map((item, index) => (
            <RunItem
              key={item.id}
              index={index}
              status={getRunItemStatus(index, state.currentItemIndex)}
              text={item.text}
              androidApi={androidApi}
              textColor={theme.runText}
            />
          ))}
        </Animated.View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 10 }}>
        {!state.voiceControlAvailable ? (
          <Text
            testID="voice-unavailable"
            style={{ color: theme.danger, textAlign: 'center' }}
          >
            Voice control unavailable — use the buttons to control playback.
          </Text>
        ) : null}
        {!state.spokenPlaybackAvailable ? (
          <Text
            testID="playback-unavailable"
            style={{ color: theme.danger, textAlign: 'center' }}
          >
            Spoken playback unavailable — the item text remains visible above.
          </Text>
        ) : null}

        <View
          style={{
            minHeight: 66,
            padding: 10,
            backgroundColor: theme.runSurface,
            borderWidth: 1,
            borderColor: theme.runBorder,
            borderRadius: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor:
                theme.mode === 'light'
                  ? 'rgba(239, 145, 111, 0.2)'
                  : 'rgba(239, 145, 111, 0.14)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="mic" color={theme.accent} size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              testID="status-banner"
              style={{ color: theme.runText, fontWeight: '700', fontSize: 13 }}
            >
              {state.status === 'speaking' && 'Speaking…'}
              {state.status === 'listening' && 'Listening'}
              {state.status === 'manual' &&
                state.voiceControlAvailable &&
                'Manual controls'}
            </Text>
            <Text
              testID={
                state.latestRecognizedPhrase.length > 0
                  ? 'transcript-panel'
                  : undefined
              }
              style={{ color: theme.runTextMuted, fontSize: 12 }}
              numberOfLines={1}
            >
              {state.latestRecognizedPhrase.length > 0
                ? state.latestRecognizedPhrase
                : 'Say next, repeat, or previous'}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <RunControl
            testID="manual-previous"
            label="Previous"
            icon="arrowLeft"
            color={theme.runText}
            background={theme.runSurface}
            border={theme.runBorder}
            onPress={() => onAction('previous')}
          />
          <Pressable
            accessibilityRole="button"
            testID="manual-next"
            onPress={() => onAction('next')}
            style={{
              flex: 1,
              minHeight: 66,
              backgroundColor: theme.accent,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Text style={{ color: '#17382e', fontWeight: '800', fontSize: 12 }}>
                Next
              </Text>
              <Icon name="arrowRight" color="#17382e" size={18} />
            </View>
          </Pressable>
          <RunControl
            testID="manual-repeat"
            label="Repeat"
            icon="repeat"
            color={theme.runText}
            background={theme.runSurface}
            border={theme.runBorder}
            onPress={() => onAction('repeat')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const RunItem = memo(function RunItem({
  index,
  status,
  text,
  androidApi,
  textColor,
}: {
  index: number;
  status: RunItemStatus;
  text: string;
  androidApi: number;
  textColor: string;
}) {
  const selected = status === 'current';
  const focusProgress = useSharedValue(selected ? 1 : 0);
  const previousStatus = useRef(status);
  const backgroundStatus: RunItemBackgroundStatus = selected
    ? previousStatus.current === 'past'
      ? 'past'
      : 'upcoming'
    : status;

  useEffect(() => {
    focusProgress.value = withTiming(selected ? 1 : 0, RUN_TRANSITION_CONFIG);
    previousStatus.current = status;
  }, [focusProgress, selected, status]);

  const animatedStyle = useAnimatedStyle(() => {
    const presentation = getRunItemPresentation(
      backgroundStatus,
      focusProgress.value,
      androidApi,
    );
    const common = {
      opacity: presentation.opacity,
      transform: [
        { translateY: '-50%' as const },
        { scale: presentation.scale },
      ],
    };
    if (androidApi < 31) return common;
    return {
      ...common,
      filter: [{ blur: presentation.blurRadius }],
    };
  }, [androidApi, backgroundStatus, focusProgress]);

  return (
    <Animated.View
      testID={`run-item-${index}`}
      accessibilityState={{ selected }}
      accessible={selected}
      importantForAccessibility={selected ? 'yes' : 'no-hide-descendants'}
      style={[
        {
          position: 'absolute',
          top: index * RUN_ITEM_GAP,
          left: 0,
          right: 0,
          minHeight: 136,
          paddingHorizontal: 8,
          paddingVertical: 6,
          alignItems: 'center',
          justifyContent: 'center',
        },
        animatedStyle,
      ]}
    >
      <Text
        style={{
          color: textColor,
          fontSize: text.length >= 55 ? 24 : 34,
          lineHeight: text.length >= 55 ? 29 : 39,
          fontWeight: '700',
          letterSpacing: text.length >= 55 ? -0.7 : -1.7,
          textAlign: 'center',
        }}
      >
        {text}
      </Text>
    </Animated.View>
  );
});

function ProgressOrbit({
  current,
  total,
  animatedCurrentIndex,
  color,
  mutedColor,
  accentColor,
  surfaceColor,
  centerBorderColor,
  labelOpacity,
  shadow,
}: {
  current: number;
  total: number;
  animatedCurrentIndex: SharedValue<number>;
  color: string;
  mutedColor: string;
  accentColor: string;
  surfaceColor: string;
  centerBorderColor: string;
  labelOpacity: number;
  shadow: string;
}) {
  const size = 116;
  const strokeWidth = 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const animatedProgressProps = useAnimatedProps(() => ({
    strokeDashoffset:
      circumference *
      (1 - (animatedCurrentIndex.value + 1) / Math.max(total, 1)),
  }));
  return (
    <View
      testID="run-progress-orbit"
      style={{
        position: 'relative',
        zIndex: 1,
        alignItems: 'center',
        paddingTop: 6,
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: shadow,
        }}
      >
        <Svg
          testID="run-progress-arc"
          pointerEvents="none"
          width={size}
          height={size}
          style={{ position: 'absolute' }}
        >
          <Circle
            testID="run-progress-background"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={mutedColor}
            strokeWidth={strokeWidth}
          />
          <AnimatedCircle
            animatedProps={animatedProgressProps}
            testID="run-progress-fill"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={accentColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeLinecap="butt"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
          <Circle
            testID="run-progress-center"
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - strokeWidth}
            fill={surfaceColor}
            stroke={centerBorderColor}
            strokeWidth={1}
          />
        </Svg>
        <Text style={{ color, fontSize: 38, lineHeight: 38, fontWeight: '700' }}>
          {current}
        </Text>
        <Text
          style={{
            color,
            opacity: labelOpacity,
            fontSize: 9,
            fontWeight: '700',
            letterSpacing: 0.7,
          }}
        >
          OF {total}
        </Text>
      </View>
      <Text style={{ position: 'absolute', opacity: 0 }}>
        Item {current} of {total}
      </Text>
    </View>
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
    <View
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
    </View>
  );
}

function RunControl({
  testID,
  label,
  icon,
  color,
  background,
  border,
  onPress,
}: {
  testID: string;
  label: string;
  icon: IconName;
  color: string;
  background: string;
  border: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={{
        width: 64,
        minHeight: 66,
        backgroundColor: background,
        borderWidth: 1,
        borderColor: border,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} color={color} size={18} />
      <Text style={{ color, fontSize: 9, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function RunTexture({ color }: { color: string }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', inset: 0, opacity: 0.025 }}
    >
      {Array.from({ length: 46 }, (_, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            top: index * 18,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

function CompletionConfetti() {
  const pieces = [
    { top: 60, left: 28, color: '#d7ad7e', rotate: '28deg' },
    { top: 104, right: 26, color: '#94bba8', rotate: '72deg' },
    { bottom: 116, left: 21, color: '#79a999', rotate: '38deg' },
    { bottom: 78, right: 33, color: '#d8bb73', rotate: '54deg' },
  ] as const;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      {pieces.map((piece, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            width: 8,
            height: 20,
            borderRadius: 4,
            ...piece,
            backgroundColor: piece.color,
            transform: [{ rotate: piece.rotate }],
          }}
        />
      ))}
    </View>
  );
}
