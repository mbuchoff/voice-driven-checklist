import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Platform,
} from 'react-native';
import {
  cancelAnimation,
  ReduceMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { CueAction } from '@/src/services/audio/cues';
import type {
  SpeechPlaybackAdapter,
  SpeechRecognitionAdapter,
} from '@/src/services/speech/adapters';
import { useTheme } from '@/src/theme/useTheme';

import { formatTimerWords } from '@/src/features/routines/timerFormat';

import { parseCommand, parseInterimCommand } from './commandParser';
import { initialRunState, isRunActive, runReducer } from './runReducer';
import { CompletionView } from './CompletionView';
import { ActiveRunView } from './RunScreenView';
import { RUN_TRANSITION_CONFIG } from './runPresentation';
import type { RoutineRunSnapshot } from './types';
import { useStepCountdown } from './useStepCountdown';

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

export type RunScreenProps = {
  snapshot: RoutineRunSnapshot;
  playback: SpeechPlaybackAdapter;
  recognition: SpeechRecognitionAdapter;
  initialAvailability: { spokenPlaybackAvailable: boolean; voiceControlAvailable: boolean };
  onExit: () => void | Promise<void>;
  onRequestStop: () => void | Promise<void>;
  onCompletion?: () => void | Promise<void>;
  onCue?: (
    action: Exclude<CueAction, 'complete'>,
  ) => boolean | void | Promise<boolean | void>;
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
    screenReaderEnabled ?? true,
  );
  const [holdingStop, setHoldingStop] = useState(false);
  const voiceRunStartupRef = useRef<VoiceRunStartup | null>(null);
  const voiceRunStartupTokenRef = useRef(0);
  const voiceRunStopRef = useRef<Promise<void>>(Promise.resolve());
  const cueStartedRef = useRef<Promise<boolean> | null>(null);
  const stopHoldGenerationRef = useRef(0);
  const activeStopHoldRef = useRef<number | null>(null);
  const stopHoldCompletedRef = useRef(false);
  const runCompletedRef = useRef(false);
  const stopHoldProgress = useSharedValue(0);
  const animatedCurrentIndex = useSharedValue(0);
  runCompletedRef.current = state.status === 'completed';

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
    let changedSinceQuery = false;
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      (enabled) => {
        changedSinceQuery = true;
        setTalkBackEnabled(enabled);
      },
    );
    void AccessibilityInfo.isScreenReaderEnabled().then(
      (enabled) => {
        if (!cancelled && !changedSinceQuery) setTalkBackEnabled(enabled);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [screenReaderEnabled]);

  useEffect(() => {
    animatedCurrentIndex.value = withTiming(
      state.currentStepIndex,
      RUN_TRANSITION_CONFIG,
    );
  }, [animatedCurrentIndex, state.currentStepIndex]);

  // Suppress onVoiceRunStop in this cleanup on the completed transition. The
  // completion effect stops the service after the chime has been started.
  const statusRef = useRef(state.status);
  statusRef.current = state.status;
  // Each arrival is left once: "next" heard as its countdown runs out (or
  // two taps) moves on, and cues, a single time. A move names the arrival
  // it leaves (by default the current one); one for an arrival that isn't
  // current, or was already left, does nothing.
  const arrivalRef = useRef(state.arrival);
  arrivalRef.current = state.arrival;
  const leftArrivalRef = useRef<number | null>(null);

  const runAction = useCallback(
    (action: 'next' | 'previous' | 'repeat', arrival: number = arrivalRef.current) => {
      if (action !== 'repeat') {
        if (!isRunActive(statusRef.current) || arrival !== arrivalRef.current || leftArrivalRef.current === arrival) return;
        leftArrivalRef.current = arrival;
      }
      const completes =
        action === 'next' &&
        state.snapshot != null &&
        state.currentStepIndex === state.snapshot.steps.length - 1;
      cueStartedRef.current = onCue && !completes
        ? Promise.resolve(onCue(action)).then(
            (audible) => audible !== false,
            () => false,
          )
        : null;
      if (action === 'next') dispatch({ type: 'NEXT', arrival });
      else if (action === 'previous') dispatch({ type: 'PREVIOUS', arrival });
      else dispatch({ type: 'REPEAT' });
    },
    [onCue, state.currentStepIndex, state.snapshot],
  );

  const completeStopHold = useCallback((generation: number) => {
    if (
      runCompletedRef.current ||
      activeStopHoldRef.current !== generation
    ) return;
    activeStopHoldRef.current = null;
    stopHoldCompletedRef.current = true;
    void onExit();
  }, [onExit]);

  const beginStopHold = useCallback(() => {
    if (talkBackEnabled || activeStopHoldRef.current !== null) return;
    const generation = stopHoldGenerationRef.current + 1;
    stopHoldGenerationRef.current = generation;
    activeStopHoldRef.current = generation;
    stopHoldCompletedRef.current = false;
    setHoldingStop(true);
    stopHoldProgress.value = 0;
    stopHoldProgress.value = withTiming(
      1,
      {
        duration: STOP_HOLD_DURATION_MS,
        reduceMotion: ReduceMotion.Never,
      },
      (finished) => {
        if (finished) scheduleOnRN(completeStopHold, generation);
      },
    );
  }, [completeStopHold, stopHoldProgress, talkBackEnabled]);

  const releaseStopHold = useCallback(() => {
    activeStopHoldRef.current = null;
    if (!stopHoldCompletedRef.current) {
      cancelAnimation(stopHoldProgress);
      stopHoldProgress.value = withTiming(0, { duration: 140 });
    }
    setHoldingStop(false);
  }, [stopHoldProgress]);

  useEffect(() => {
    if (state.status !== 'completed') return;
    stopHoldGenerationRef.current += 1;
    activeStopHoldRef.current = null;
    stopHoldCompletedRef.current = false;
    cancelAnimation(stopHoldProgress);
    stopHoldProgress.value = 0;
    setHoldingStop(false);
  }, [state.status, stopHoldProgress]);

  const spokenPlaybackReady = !state.voiceControlAvailable || voiceServiceReady;

  // Drive spoken playback whenever the run is in the `speaking` state. Bumps
  // to `playbackTick` (e.g. REPEAT) cause the same item to be re-spoken.
  // When voice control is available, wait for voice-run startup so Android
  // applies the audio route before TTS; without voice control, routed playback
  // self-arms that route before speaking.
  useEffect(() => {
    if (state.status !== 'speaking' || !state.snapshot || !spokenPlaybackReady) return;
    const item = state.snapshot.steps[state.currentStepIndex];
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
    const cueStarted = cueStartedRef.current;
    cueStartedRef.current = null;
    if (cueStarted) {
      void cueStarted.then((audible) => {
        if (cancelled) return;
        if (audible) {
          speechTimer = setTimeout(speak, CUE_TO_SPEECH_DELAY_MS);
        } else {
          speak();
        }
      });
    } else {
      speak();
    }
    return () => {
      cancelled = true;
      if (speechTimer) clearTimeout(speechTimer);
      playback.stop();
    };
  }, [
    state.status,
    state.snapshot,
    state.currentStepIndex,
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

  // A timed step counts down from the moment the run reaches it; at zero the
  // reading is cut off and the run moves on as if you'd said "next".
  const currentStep = state.snapshot?.steps[state.currentStepIndex];
  const runActionRef = useRef(runAction);
  runActionRef.current = runAction;
  const countdown = useStepCountdown({
    timerSeconds: currentStep?.timerSeconds ?? null,
    arrival: state.arrival,
    active: isRunActive(state.status),
    keepsRunningInBackground: voiceRunActive,
    onExpire: (arrival) => runActionRef.current('next', arrival),
  });

  useEffect(() => {
    const seconds = currentStep?.timerSeconds;
    if (!seconds || !talkBackEnabled) return;
    AccessibilityInfo.announceForAccessibility(`Timed step, ${formatTimerWords(seconds)}`);
    // Announced once per arrival at a timed step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.arrival]);

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

  const totalSteps = state.snapshot?.steps.length ?? 0;
  const androidApi = Platform.OS === 'android' ? Number(Platform.Version) : 0;

  if (state.status === 'completed') {
    return (
      <CompletionView
        totalSteps={totalSteps}
        routineTitle={state.snapshot?.routineTitle}
        onRestart={() => {
          cueStartedRef.current = null;
          dispatch({ type: 'RESTART' });
        }}
        onExit={onExit}
      />
    );
  }

  return (
    <ActiveRunView
      state={state}
      theme={theme}
      androidApi={androidApi}
      talkBackEnabled={talkBackEnabled}
      holdingStop={holdingStop}
      animatedCurrentIndex={animatedCurrentIndex}
      stopHoldProgress={stopHoldProgress}
      onBeginStopHold={beginStopHold}
      onReleaseStopHold={releaseStopHold}
      onRequestStop={onRequestStop}
      onAction={runAction}
      countdown={countdown}
    />
  );
}
