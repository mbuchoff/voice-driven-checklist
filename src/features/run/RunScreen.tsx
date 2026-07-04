import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import type {
  SpeechPlaybackAdapter,
  SpeechRecognitionAdapter,
} from '@/src/services/speech/adapters';
import { useTheme } from '@/src/theme/useTheme';

import { parseCommand, parseInterimCommand } from './commandParser';
import { initialRunState, runReducer } from './runReducer';
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

export type RunScreenProps = {
  snapshot: ChecklistRunSnapshot;
  playback: SpeechPlaybackAdapter;
  recognition: SpeechRecognitionAdapter;
  initialAvailability: { spokenPlaybackAvailable: boolean; voiceControlAvailable: boolean };
  onExit: () => void | Promise<void>;
  onRequestStop: () => void | Promise<void>;
  isStopConfirmationPending?: () => boolean;
  onCompletion?: () => void | Promise<void>;
  onVoiceRunStart?: () => void | Promise<void>;
  onVoiceRunStop?: () => void | Promise<void>;
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
  isStopConfirmationPending,
  onCompletion,
  onVoiceRunStart,
  onVoiceRunStop,
}: RunScreenProps) {
  const theme = useTheme();
  const [state, dispatch] = useReducer(runReducer, undefined, () =>
    initialRunState(snapshot, initialAvailability),
  );
  const [voiceServiceReady, setVoiceServiceReady] = useState(!onVoiceRunStart);
  const voiceRunStartupRef = useRef<VoiceRunStartup | null>(null);
  const voiceRunStartupTokenRef = useRef(0);
  const voiceRunStopRef = useRef<Promise<void>>(Promise.resolve());

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

  const controlStyle = {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 6,
  } as const;

  // Drive spoken playback whenever the run is in the `speaking` state. Bumps
  // to `playbackTick` (e.g. REPEAT) cause the same item to be re-spoken.
  useEffect(() => {
    if (state.status !== 'speaking' || !state.snapshot) return;
    const item = state.snapshot.items[state.currentItemIndex];
    let cancelled = false;
    playback
      .speak(item.text, { locale: LOCALE })
      .then(() => {
        if (!cancelled) dispatch({ type: 'PLAYBACK_FINISHED' });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'PLAYBACK_UNAVAILABLE' });
      });
    return () => {
      cancelled = true;
      playback.stop();
    };
  }, [
    state.status,
    state.snapshot,
    state.currentItemIndex,
    state.playbackTick,
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
            if (cmd === 'next') dispatch({ type: 'NEXT' });
            else if (cmd === 'repeat') dispatch({ type: 'REPEAT' });
            else dispatch({ type: 'PREVIOUS' });
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
  }, [state.status, state.playbackTick, recognition, voiceServiceReady]);

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
      if (isStopConfirmationPending?.()) return false;
      if (state.status === 'completed') {
        void onExit();
      } else {
        void onRequestStop();
      }
      return true;
    });
    return () => sub.remove();
  }, [state.status, onExit, onRequestStop, isStopConfirmationPending]);

  const currentItem = state.snapshot?.items[state.currentItemIndex];
  const totalItems = state.snapshot?.items.length ?? 0;

  if (state.status === 'completed') {
    return (
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={{ padding: 24, gap: 16 }}
      >
        <Text style={{ color: theme.text, fontSize: 24, fontWeight: '700' }}>Checklist complete</Text>
        <Text style={{ color: theme.text }}>You finished “{state.snapshot?.checklistTitle}”.</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            testID="completion-restart"
            onPress={() => dispatch({ type: 'RESTART' })}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 18,
              backgroundColor: theme.primary,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: theme.onPrimary, fontWeight: '600' }}>Restart</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="completion-return"
            onPress={onExit}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 18,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: theme.text }}>Return to library</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 24, gap: 16 }}
    >
      <Text style={{ color: theme.text, fontSize: 18, fontWeight: '600' }}>{state.snapshot?.checklistTitle}</Text>
      <Text style={{ color: theme.textMuted }}>
        Item {state.currentItemIndex + 1} of {totalItems}
      </Text>

      <View
        style={{
          padding: 18,
          borderWidth: 1,
          borderColor: theme.inputBorder,
          borderRadius: 8,
          minHeight: 80,
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: theme.text, fontSize: 22 }}>{currentItem?.text}</Text>
      </View>

      <Text testID="status-banner" style={{ color: theme.textMuted }}>
        {state.status === 'speaking' && 'Speaking…'}
        {state.status === 'listening' && 'Listening for "next", "repeat", or "previous"…'}
        {state.status === 'manual' && state.voiceControlAvailable && 'Use the buttons below to advance.'}
      </Text>

      {!state.voiceControlAvailable && (
        <Text testID="voice-unavailable" style={{ color: theme.danger }}>
          Voice control unavailable — use the buttons to control playback.
        </Text>
      )}
      {!state.spokenPlaybackAvailable && (
        <Text testID="playback-unavailable" style={{ color: theme.danger }}>
          Spoken playback unavailable — the item text remains visible above.
        </Text>
      )}

      {state.latestRecognizedPhrase.length > 0 && (
        <View
          testID="transcript-panel"
          style={{ padding: 12, backgroundColor: theme.surfaceAlt, borderRadius: 6 }}
        >
          <Text style={{ color: theme.textSubtle }}>I heard:</Text>
          <Text style={{ color: theme.text, fontSize: 16 }}>{state.latestRecognizedPhrase}</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Pressable
          accessibilityRole="button"
          testID="manual-previous"
          onPress={() => dispatch({ type: 'PREVIOUS' })}
          style={controlStyle}
        >
          <Text style={{ color: theme.text }}>Previous</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          testID="manual-repeat"
          onPress={() => dispatch({ type: 'REPEAT' })}
          style={controlStyle}
        >
          <Text style={{ color: theme.text }}>Repeat</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          testID="manual-next"
          onPress={() => dispatch({ type: 'NEXT' })}
          style={controlStyle}
        >
          <Text style={{ color: theme.text }}>Next</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          testID="manual-stop"
          onPress={onRequestStop}
          style={[controlStyle, { borderColor: theme.danger }]}
        >
          <Text style={{ color: theme.danger }}>Stop</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
