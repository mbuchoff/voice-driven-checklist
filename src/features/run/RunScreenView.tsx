import { Pressable, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Icon, type IconName } from '@/src/components/Icon';
import { ScreenBackground } from '@/src/components/ScreenBackground';
import type { Palette } from '@/src/theme/palette';

import {
  RUN_ITEM_GAP,
  getRunItemPresentationAtPosition,
  getRunProgressPalette,
  getRunTrackOffset,
} from './runPresentation';
import type { ChecklistRunState } from './types';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type RunCommand = 'next' | 'previous' | 'repeat';

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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#173d31', padding: 24 }}>
      <ScreenBackground variant="completion" />
      <CompletionConfetti />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
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
  const stopControlStyle = useAnimatedStyle(() => {
    const size = interpolate(stopHoldProgress.value, [0, 0.15, 1], [44, 66, 66]);
    return { width: size, height: size, borderRadius: size / 2 };
  });

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
            onPressIn={onBeginStopHold}
            onPressOut={onReleaseStopHold}
            onPress={() => {
              if (talkBackEnabled) void onRequestStop();
            }}
          >
            <Animated.View
              testID="stop-hold-control"
              style={[
                {
                  width: 44,
                  height: 44,
                  borderRadius: 22,
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
          </Pressable>
          {holdingStop ? (
            <Text
              style={{
                color: '#17382e',
                backgroundColor: theme.accent,
                borderRadius: 9,
                paddingHorizontal: 12,
                paddingVertical: 6,
                fontWeight: '800',
                fontSize: 12,
              }}
            >
              Keep holding
            </Text>
          ) : null}
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
        color={theme.runText}
        mutedColor={progressPalette.track}
        accentColor={theme.accent}
        surfaceColor={progressPalette.surface}
        centerBorderColor={progressPalette.centerBorder}
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
              currentIndex={state.currentItemIndex}
              animatedCurrentIndex={animatedCurrentIndex}
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

function RunItem({
  index,
  currentIndex,
  animatedCurrentIndex,
  text,
  androidApi,
  textColor,
}: {
  index: number;
  currentIndex: number;
  animatedCurrentIndex: SharedValue<number>;
  text: string;
  androidApi: number;
  textColor: string;
}) {
  const selected = index === currentIndex;
  const animatedStyle = useAnimatedStyle(() => {
    const presentation = getRunItemPresentationAtPosition(
      index,
      animatedCurrentIndex.value,
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
  }, [androidApi, animatedCurrentIndex, index]);

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
}

function ProgressOrbit({
  current,
  total,
  color,
  mutedColor,
  accentColor,
  surfaceColor,
  centerBorderColor,
  shadow,
}: {
  current: number;
  total: number;
  color: string;
  mutedColor: string;
  accentColor: string;
  surfaceColor: string;
  centerBorderColor: string;
  shadow: string;
}) {
  const size = 116;
  const strokeWidth = 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = current / Math.max(total, 1);
  return (
    <View style={{ alignItems: 'center', paddingTop: 6 }}>
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
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={accentColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - progress)}
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
            opacity: 0.64,
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
