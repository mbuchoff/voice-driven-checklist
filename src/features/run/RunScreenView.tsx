import { memo, useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { formatTimerWords } from '@/src/features/routines/timerFormat';
import { ScreenBackground } from '@/src/components/ScreenBackground';
import type { Palette } from '@/src/theme/palette';

import {
  formatCountdownClock,
  RUN_STEP_GAP,
  RUN_TRANSITION_CONFIG,
  getRunStepPresentation,
  getRunStepStatus,
  getRunProgressPalette,
  getRunTrackOffset,
  type RunStepBackgroundStatus,
  type RunStepStatus,
} from './runPresentation';
import { StopRunControl } from './StopRunControl';
import type { RoutineRunState } from './types';
import type { StepCountdown } from './useStepCountdown';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type RunCommand = 'next' | 'previous' | 'repeat';

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
  countdown = null,
}: {
  /** The current step's countdown, for a timed step. */
  countdown?: StepCountdown | null;
  state: RoutineRunState;
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
  const totalSteps = state.snapshot?.steps.length ?? 0;
  const steps = state.snapshot?.steps ?? [];
  const progressPalette = getRunProgressPalette(theme.mode);
  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: getRunTrackOffset(animatedCurrentIndex.value) }],
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.runBackground }}>
      <ScreenBackground variant="run" />
      <RunTexture color={theme.runText} />

      <View
        testID="run-header"
        style={{
          height: 76,
          paddingHorizontal: 20,
          position: 'relative',
          zIndex: 3,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            zIndex: 2,
          }}
        >
          <StopRunControl
            theme={theme}
            talkBackEnabled={talkBackEnabled}
            holdingStop={holdingStop}
            stopHoldProgress={stopHoldProgress}
            onBeginStopHold={onBeginStopHold}
            onReleaseStopHold={onReleaseStopHold}
            onRequestStop={onRequestStop}
          />
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
              {state.snapshot?.routineTitle}
            </Text>
          ) : null}
        </View>
      </View>

      <ProgressOrbit
        current={state.currentStepIndex + 1}
        total={totalSteps}
        animatedCurrentIndex={animatedCurrentIndex}
        color={theme.runText}
        mutedColor={progressPalette.track}
        accentColor={progressPalette.fill}
        surfaceColor={progressPalette.surface}
        centerBorderColor={progressPalette.centerBorder}
        labelOpacity={progressPalette.labelOpacity}
        shadow={progressPalette.shadow}
        timeUsed={countdown ? 1 - countdown.remainingSeconds / countdown.totalSeconds : null}
      />

      <View testID="run-steps-stage" style={{ flex: 1, overflow: 'visible' }}>
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
          {steps.map((step, index) => (
            <RunStep
              key={step.id}
              index={index}
              status={getRunStepStatus(index, state.currentStepIndex)}
              text={step.text}
              androidApi={androidApi}
              textColor={theme.runText}
              countdownSeconds={
                index === state.currentStepIndex && countdown ? countdown.remainingSeconds : null
              }
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
            Spoken playback unavailable — the step text remains visible above.
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

const RunStep = memo(function RunStep({
  index,
  status,
  text,
  androidApi,
  textColor,
  countdownSeconds = null,
}: {
  index: number;
  status: RunStepStatus;
  text: string;
  androidApi: number;
  textColor: string;
  /** Time left on this step's countdown, shown under its text. */
  countdownSeconds?: number | null;
}) {
  const selected = status === 'current';
  const focusProgress = useSharedValue(selected ? 1 : 0);
  const previousStatus = useRef(status);
  const backgroundStatus: RunStepBackgroundStatus = selected
    ? previousStatus.current === 'past'
      ? 'past'
      : 'upcoming'
    : status;

  useEffect(() => {
    focusProgress.value = withTiming(selected ? 1 : 0, RUN_TRANSITION_CONFIG);
    previousStatus.current = status;
  }, [focusProgress, selected, status]);

  const animatedStyle = useAnimatedStyle(() => {
    const presentation = getRunStepPresentation(
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
      testID={`run-step-${index}`}
      accessibilityState={{ selected }}
      accessible={selected}
      importantForAccessibility={selected ? 'yes' : 'no-hide-descendants'}
      style={[
        {
          position: 'absolute',
          top: index * RUN_STEP_GAP,
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
      {countdownSeconds != null ? (
        <Text
          testID="run-countdown"
          accessibilityLabel={`${formatTimerWords(countdownSeconds)} left`}
          style={{
            marginTop: 8,
            color: textColor,
            opacity: 0.72,
            fontSize: 24,
            lineHeight: 28,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatCountdownClock(countdownSeconds)}
        </Text>
      ) : null}
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
  timeUsed = null,
}: {
  /** For a timed step, the share of its countdown used; fills the ring. */
  timeUsed?: number | null;
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
  const countdownProgress = useSharedValue(timeUsed ?? 0);
  const counting = timeUsed != null;
  useEffect(() => {
    if (timeUsed == null) return;
    countdownProgress.value = withTiming(timeUsed, { duration: 250 });
  }, [countdownProgress, timeUsed]);
  const animatedProgressProps = useAnimatedProps(() => ({
    strokeDashoffset: counting
      ? circumference * (1 - countdownProgress.value)
      : circumference *
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
        Step {current} of {total}
      </Text>
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
