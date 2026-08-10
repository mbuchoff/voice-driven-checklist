import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  interpolate,
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
import type { CueAction } from '@/src/services/audio/cues';
import type {
  SpeechPlaybackAdapter,
  SpeechRecognitionAdapter,
} from '@/src/services/speech/adapters';
import { useTheme } from '@/src/theme/useTheme';

import { parseCommand, parseInterimCommand } from './commandParser';
import { initialRunState, runReducer } from './runReducer';
import {
  RUN_ITEM_GAP,
  getRunItemPresentation,
  getRunTrackOffset,
} from './runPresentation';
import type { ChecklistRunSnapshot } from './types';

const LOCALE = 'en-US';

// Recognizer codes that mean "didn't hear a command this window" rather than
// "voice is broken." On Android the system recognizer fires `no-speech` after
// every silent timeout (often <5s), so treating it as fatal kills voice for
// the rest of the run.
const TRANSIENT_RECOGNITION_ERRORS = new Set([
  'no-speech',
  'no-match',
  'speech-timeout',
  'network',
  'busy',
]);

const RECOGNITION_RESTART_DELAY_MS = 500;
const RECOGNITION_END_RESTART_DELAY_MS = 0;
const CUE_TO_SPEECH_DELAY_MS = 175;
const STOP_HOLD_DURATION_MS = 1200;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type RunScreenProps = {
  snapshot: ChecklistRunSnapshot;
  playback: SpeechPlaybackAdapter;
  recognition: SpeechRecognitionAdapter;
  initialAvailability: { spokenPlaybackAvailable: boolean; voiceControlAvailable: boolean };
  onExit: () => void | Promise<void>;
  onRequestStop: () => void | Promise<void>;
  onStopHoldComplete?: () => void | Promise<void>;
  onCompletion?: () => void | Promise<void>;
  onCue?: (action: Exclude<CueAction, 'complete'>) => void | Promise<void>;
  onVoiceRunStart?: () => void | Promise<void>;
  onVoiceRunStop?: () => void | Promise<void>;
  screenReaderEnabled?: boolean;
};

type VoiceRunStartup = {
  token: number;
  startup: Promise<void>;
};

export function RunScreen({
  snapshot,
  playback,
  recognition,
  initialAvailability,
  onExit,
  onRequestStop,
  onStopHoldComplete = onExit,
  onCompletion,
  onCue,
  onVoiceRunStart,
  onVoiceRunStop,
  screenReaderEnabled,
}: RunScreenProps) {
  const theme = useTheme();
  const [state, dispatch] = useReducer(runReducer, undefined, () =>
    initialRunState(snapshot, initialAvailability),
  );
  const [voiceServiceReady, setVoiceServiceReady] = useState(!onVoiceRunStart);
  const [talkBackEnabled, setTalkBackEnabled] = useState(
    screenReaderEnabled ?? false,
  );
  const [holdingStop, setHoldingStop] = useState(false);
  const voiceRunStartupRef = useRef<VoiceRunStartup | null>(null);
  const voiceRunStartupTokenRef = useRef(0);
  const voiceRunStopRef = useRef<Promise<void>>(Promise.resolve());
  const speechDelayRef = useRef(0);
  const stopHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopHoldCompletedRef = useRef(false);
  const stopHoldProgress = useSharedValue(0);
  const trackOffset = useSharedValue(getRunTrackOffset(0));

  const stopVoiceRun = useCallback(() => {
    const stop = voiceRunStopRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await onVoiceRunStop?.();
        } catch {
          // Stopping is best effort; the route-level resource cleanup can converge
          // with other lifecycle paths.
        }
      });
    voiceRunStopRef.current = stop;
    return stop;
  }, [onVoiceRunStop]);

  useEffect(() => {
    if (screenReaderEnabled !== undefined) {
      setTalkBackEnabled(screenReaderEnabled);
      return;
    }
    let cancelled = false;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (!cancelled) setTalkBackEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, [screenReaderEnabled]);

  useEffect(() => {
    trackOffset.value = withTiming(getRunTrackOffset(state.currentItemIndex), {
      duration: 240,
    });
  }, [state.currentItemIndex, trackOffset]);

  const runAction = useCallback(
    (action: 'next' | 'previous' | 'repeat') => {
      const completes =
        action === 'next' &&
        state.snapshot != null &&
        state.currentItemIndex === state.snapshot.items.length - 1;
      speechDelayRef.current = onCue && !completes ? CUE_TO_SPEECH_DELAY_MS : 0;
      if (onCue && !completes) {
        void Promise.resolve(onCue(action)).catch(() => undefined);
      }
      if (action === 'next') dispatch({ type: 'NEXT' });
      else if (action === 'previous') dispatch({ type: 'PREVIOUS' });
      else dispatch({ type: 'REPEAT' });
    },
    [onCue, state.currentItemIndex, state.snapshot],
  );

  const beginStopHold = useCallback(() => {
    if (talkBackEnabled || stopHoldTimerRef.current) return;
    stopHoldCompletedRef.current = false;
    setHoldingStop(true);
    stopHoldProgress.value = 0;
    stopHoldProgress.value = withTiming(1, { duration: STOP_HOLD_DURATION_MS });
    stopHoldTimerRef.current = setTimeout(() => {
      stopHoldTimerRef.current = null;
      stopHoldCompletedRef.current = true;
      void onStopHoldComplete();
    }, STOP_HOLD_DURATION_MS);
  }, [onStopHoldComplete, stopHoldProgress, talkBackEnabled]);

  const releaseStopHold = useCallback(() => {
    if (stopHoldTimerRef.current) {
      clearTimeout(stopHoldTimerRef.current);
      stopHoldTimerRef.current = null;
    }
    if (!stopHoldCompletedRef.current) {
      cancelAnimation(stopHoldProgress);
      stopHoldProgress.value = withTiming(0, { duration: 140 });
    }
    setHoldingStop(false);
  }, [stopHoldProgress]);

  useEffect(
    () => () => {
      if (stopHoldTimerRef.current) clearTimeout(stopHoldTimerRef.current);
    },
    [],
  );

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: trackOffset.value }],
  }));

  const stopControlStyle = useAnimatedStyle(() => {
    const size = interpolate(stopHoldProgress.value, [0, 0.15, 1], [44, 66, 66]);
    return { width: size, height: size, borderRadius: size / 2 };
  });

  const spokenPlaybackReady = !state.voiceControlAvailable || voiceServiceReady;

  // Drive spoken playback whenever the run is in the `speaking` state. Bumps
  // to `playbackTick` (e.g. REPEAT) cause the same item to be re-spoken.
  // When voice control is available, wait for voice-run startup so Android
  // applies the audio route before TTS; without voice control, routed playback
  // self-arms that route before speaking.
  useEffect(() => {
    if (state.status !== 'speaking' || !state.snapshot || !spokenPlaybackReady) return;
    const item = state.snapshot.items[state.currentItemIndex];
    let cancelled = false;
    let speechTimer: ReturnType<typeof setTimeout> | null = null;
    const speak = () => {
      playback
        .speak(item.text, { locale: LOCALE })
        .then(() => {
          if (!cancelled) dispatch({ type: 'PLAYBACK_FINISHED' });
        })
        .catch(() => {
          if (!cancelled) dispatch({ type: 'PLAYBACK_UNAVAILABLE' });
        });
    };
    const delay = speechDelayRef.current;
    speechDelayRef.current = 0;
    if (delay > 0) speechTimer = setTimeout(speak, delay);
    else speak();
    return () => {
      cancelled = true;
      if (speechTimer) clearTimeout(speechTimer);
      playback.stop();
    };
  }, [
    state.status,
    state.snapshot,
    state.currentItemIndex,
    state.playbackTick,
    spokenPlaybackReady,
    playback,
  ]);

  // Run one continuous recognition session while in `listening`.
  useEffect(() => {
    if (state.status !== 'listening' || !voiceServiceReady) return;
    let cancelled = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    // Give Android's RecognitionService a cleanup window between stop() and
    // the next start() after a transient error.
    const scheduleRestart = (delayMs: number) => {
      if (restartTimer) return;
      restartTimer = setTimeout(() => {
        restartTimer = null;
        startCycle();
      }, delayMs);
    };

    const startCycle = () => {
      if (cancelled) return;
      recognition
        .startListening({
          locale: LOCALE,
          onResult: (result) => {
            if (cancelled) return;
            const cmd = result.isFinal
              ? parseCommand(result.transcript)
              : parseInterimCommand(result.transcript);
            if (result.isFinal) {
              dispatch({ type: 'RECOGNIZED_PHRASE', phrase: result.transcript });
            }
            if (!cmd) return;
            cancelled = true;
            void recognition.stopListening();
            runAction(cmd);
          },
          onError: (error) => {
            if (cancelled) return;
            if (error === 'aborted') {
              // A natural end can be followed by a late result; keep the
              // current subscription alive until the restart replaces it.
              scheduleRestart(RECOGNITION_END_RESTART_DELAY_MS);
              return;
            }
            if (TRANSIENT_RECOGNITION_ERRORS.has(error)) {
              recognition.stopListening().then(() => {
                if (!cancelled) scheduleRestart(RECOGNITION_RESTART_DELAY_MS);
              });
            } else {
              cancelled = true;
              dispatch({ type: 'VOICE_UNAVAILABLE' });
            }
          },
        })
        .catch(() => {
          if (!cancelled) dispatch({ type: 'VOICE_UNAVAILABLE' });
        });
    };

    startCycle();
    return () => {
      cancelled = true;
      if (restartTimer) clearTimeout(restartTimer);
      recognition.stopListening();
    };
  }, [
    state.status,
    state.playbackTick,
    recognition,
    voiceServiceReady,
    runAction,
  ]);

  // Start before the first listening window so locking during spoken playback
  // still leaves Android ready to open the mic under a foreground service.
  const voiceRunActive =
    state.voiceControlAvailable &&
    (state.status === 'speaking' || state.status === 'listening');

  // Suppress onVoiceRunStop in this cleanup on the completed transition. The
  // completion effect stops the service after the chime has been started.
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  useEffect(() => {
    setVoiceServiceReady(!onVoiceRunStart);
    if (!voiceRunActive) return;
    let cancelled = false;
    const token = voiceRunStartupTokenRef.current + 1;
    voiceRunStartupTokenRef.current = token;
    const startup = voiceRunStopRef.current
      .catch(() => undefined)
      .then(() => {
        if (cancelled || voiceRunStartupRef.current?.token !== token) return;
        return onVoiceRunStart?.();
      });
    voiceRunStartupRef.current = { token, startup };
    startup.then(
      () => {
        if (cancelled || voiceRunStartupRef.current?.token !== token) return;
        setVoiceServiceReady(true);
      },
      () => {
        if (!cancelled && voiceRunStartupRef.current?.token === token) {
          dispatch({ type: 'VOICE_UNAVAILABLE' });
        }
      },
    );
    return () => {
      cancelled = true;
      if (statusRef.current === 'completed') return;
      void startup
        .catch(() => undefined)
        .then(() => {
          if (voiceRunStartupRef.current?.token !== token) return;
          voiceRunStartupRef.current = null;
          return stopVoiceRun();
        });
    };
  }, [voiceRunActive, onVoiceRunStart, stopVoiceRun]);

  // Stop recognition on completion, then stop the Android foreground service
  // after the completion sound callback has had a chance to start playback.
  useEffect(() => {
    if (state.status !== 'completed') return;
    let cancelled = false;
    const startup = voiceRunStartupRef.current;
    void recognition.stopListening();
    void Promise.resolve()
      .then(() => onCompletion?.())
      .catch(() => undefined)
      .then(() => startup?.startup)
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        if (startup && voiceRunStartupRef.current?.token === startup.token) {
          voiceRunStartupRef.current = null;
        }
        return stopVoiceRun();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [state.status, recognition, onCompletion, stopVoiceRun]);

  // Tear down adapters when the screen unmounts.
  useEffect(() => {
    return () => {
      playback.dispose();
      recognition.dispose();
    };
  }, [playback, recognition]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (state.status === 'completed') {
        void onExit();
      } else {
        void onRequestStop();
      }
      return true;
    });
    return () => sub.remove();
  }, [state.status, onExit, onRequestStop]);

  const totalItems = state.snapshot?.items.length ?? 0;
  const items = state.snapshot?.items ?? [];
  const androidApi = Platform.OS === 'android' ? Number(Platform.Version) : 0;

  if (state.status === 'completed') {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: '#173d31', padding: 24 }}
      >
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
          <Text style={{ color: '#f4bca6', fontSize: 12, fontWeight: '800', letterSpacing: 1.56, marginBottom: 8 }}>
            CHECKLIST COMPLETE
          </Text>
          <Text style={{ color: '#fffaf1', fontSize: 40, lineHeight: 39, fontWeight: '700', letterSpacing: -2.2, marginBottom: 12 }}>
            Nicely done.
          </Text>
          <Text style={{ color: 'rgba(255, 250, 241, 0.66)', fontSize: 16, lineHeight: 25, textAlign: 'center', marginBottom: 36 }}>
            All {totalItems} steps in “{state.snapshot?.checklistTitle}” are checked off.
          </Text>
          <View style={{ width: '100%', gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              testID="completion-restart"
              onPress={() => {
                speechDelayRef.current = 0;
                dispatch({ type: 'RESTART' });
              }}
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
              <Text style={{ color: '#173d31', fontWeight: '700', fontSize: 16 }}>Run it again</Text>
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
              <Text style={{ color: '#fffaf1', fontWeight: '700', fontSize: 16 }}>Back to my checklists</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.runBackground }}>
      <ScreenBackground variant="run" />
      <RunTexture color={theme.runText} />

      <View style={{ height: 76, paddingHorizontal: 20, position: 'relative', flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop run"
            accessibilityHint={
              talkBackEnabled
                ? 'Opens a confirmation dialog'
                : 'Press and hold for one point two seconds'
            }
            testID="stop-run"
            onPressIn={beginStopHold}
            onPressOut={releaseStopHold}
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
              style={{ color: theme.runText, fontSize: 14, fontWeight: '700', textAlign: 'center', width: '100%' }}
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
        mutedColor={theme.runBorder}
        accentColor={theme.accent}
        surfaceColor={theme.runSurface}
      />

      <View testID="run-items-stage" style={{ flex: 1, overflow: 'hidden' }}>
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
              text={item.text}
              androidApi={androidApi}
              textColor={theme.runText}
            />
          ))}
        </Animated.View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingBottom: 10, gap: 10 }}>
        {!state.voiceControlAvailable ? (
          <Text testID="voice-unavailable" style={{ color: theme.danger, textAlign: 'center' }}>
            Voice control unavailable — use the buttons to control playback.
          </Text>
        ) : null}
        {!state.spokenPlaybackAvailable ? (
          <Text testID="playback-unavailable" style={{ color: theme.danger, textAlign: 'center' }}>
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
              backgroundColor: theme.mode === 'light' ? 'rgba(239, 145, 111, 0.2)' : 'rgba(239, 145, 111, 0.14)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="mic" color={theme.accent} size={20} />
          </View>
          <View style={{ flex: 1 }}>
            <Text testID="status-banner" style={{ color: theme.runText, fontWeight: '700', fontSize: 13 }}>
              {state.status === 'speaking' && 'Speaking…'}
              {state.status === 'listening' && 'Listening'}
              {state.status === 'manual' && state.voiceControlAvailable && 'Manual controls'}
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
            onPress={() => runAction('previous')}
          />
          <Pressable
            accessibilityRole="button"
            testID="manual-next"
            onPress={() => runAction('next')}
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
              <Text style={{ color: '#17382e', fontWeight: '800', fontSize: 12 }}>Next</Text>
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
            onPress={() => runAction('repeat')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function RunItem({
  index,
  currentIndex,
  text,
  androidApi,
  textColor,
}: {
  index: number;
  currentIndex: number;
  text: string;
  androidApi: number;
  textColor: string;
}) {
  const selected = index === currentIndex;
  const presentation = getRunItemPresentation(index, currentIndex, androidApi);
  const emphasis = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    emphasis.value = withTiming(selected ? 1 : 0, { duration: 220 });
  }, [emphasis, selected]);

  const animatedStyle = useAnimatedStyle(() => {
    const common = {
      opacity: interpolate(
        emphasis.value,
        [0, 1],
        [presentation.opacity, 1],
      ),
      transform: [
        { translateY: '-50%' as const },
        {
          scale: interpolate(
            emphasis.value,
            [0, 1],
            [presentation.scale, 1],
          ),
        },
      ],
    };
    if (androidApi < 31) return common;
    return {
      ...common,
      filter: [
        {
          blur:
            presentation.blurRadius === 0
              ? 0
              : interpolate(
                  emphasis.value,
                  [0, 1],
                  [presentation.blurRadius, 0],
                ),
        },
      ],
    };
  }, [
    androidApi,
    presentation.blurRadius,
    presentation.opacity,
    presentation.scale,
  ]);

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
}: {
  current: number;
  total: number;
  color: string;
  mutedColor: string;
  accentColor: string;
  surfaceColor: string;
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
          boxShadow: '0 4px 10px rgba(20, 50, 40, 0.12)',
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
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill={surfaceColor}
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
        </Svg>
        <Text style={{ color, fontSize: 38, lineHeight: 38, fontWeight: '700' }}>{current}</Text>
        <Text style={{ color, opacity: 0.64, fontSize: 9, fontWeight: '700', letterSpacing: 0.7 }}>OF {total}</Text>
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
        <Circle cx="26" cy="26" r="24" fill="none" stroke={trackColor} strokeWidth="3" />
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
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, opacity: 0.025 }}>
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
