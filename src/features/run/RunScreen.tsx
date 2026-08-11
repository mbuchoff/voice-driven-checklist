import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Platform,
} from 'react-native';
import {
  cancelAnimation,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { CueAction } from '@/src/services/audio/cues';
import type {
  SpeechPlaybackAdapter,
  SpeechRecognitionAdapter,
} from '@/src/services/speech/adapters';
import { useTheme } from '@/src/theme/useTheme';

import { parseCommand, parseInterimCommand } from './commandParser';
import { initialRunState, runReducer } from './runReducer';
import { ActiveRunView, CompletionView } from './RunScreenView';
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
  const animatedCurrentIndex = useSharedValue(0);

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
    animatedCurrentIndex.value = withTiming(state.currentItemIndex, {
      duration: 240,
    });
  }, [animatedCurrentIndex, state.currentItemIndex]);

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
  const androidApi = Platform.OS === 'android' ? Number(Platform.Version) : 0;

  if (state.status === 'completed') {
    return (
      <CompletionView
        totalItems={totalItems}
        checklistTitle={state.snapshot?.checklistTitle}
        onRestart={() => {
          speechDelayRef.current = 0;
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
    />
  );
}
