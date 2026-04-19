import { useEffect, useReducer } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type {
  SpeechPlaybackAdapter,
  SpeechRecognitionAdapter,
} from '@/src/services/speech/adapters';

import { parseCommand } from './commandParser';
import { initialRunState, runReducer } from './runReducer';
import type { ChecklistRunSnapshot } from './types';

const LOCALE = 'en-US';

export type RunScreenProps = {
  snapshot: ChecklistRunSnapshot;
  playback: SpeechPlaybackAdapter;
  recognition: SpeechRecognitionAdapter;
  initialAvailability: { spokenPlaybackAvailable: boolean; voiceControlAvailable: boolean };
  onExit: () => void;
  onCompletion?: () => void;
};

export function RunScreen({
  snapshot,
  playback,
  recognition,
  initialAvailability,
  onExit,
  onCompletion,
}: RunScreenProps) {
  const [state, dispatch] = useReducer(runReducer, undefined, () =>
    initialRunState(snapshot, initialAvailability),
  );

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

  // Run a one-shot recognition cycle while in `listening`. Restart the cycle
  // for non-command speech so we keep listening for the same item.
  useEffect(() => {
    if (state.status !== 'listening') return;
    let cancelled = false;

    const startCycle = () => {
      if (cancelled) return;
      recognition
        .startListening({
          locale: LOCALE,
          onResult: (result) => {
            if (cancelled || !result.isFinal) return;
            dispatch({ type: 'RECOGNIZED_PHRASE', phrase: result.transcript });
            const cmd = parseCommand(result.transcript);
            if (cmd === 'next') dispatch({ type: 'NEXT' });
            else if (cmd === 'repeat') dispatch({ type: 'REPEAT' });
            else if (cmd === 'previous') dispatch({ type: 'PREVIOUS' });
            else recognition.stopListening().then(startCycle);
          },
          onError: () => {
            if (!cancelled) dispatch({ type: 'VOICE_UNAVAILABLE' });
          },
        })
        .catch(() => {
          if (!cancelled) dispatch({ type: 'VOICE_UNAVAILABLE' });
        });
    };

    startCycle();
    return () => {
      cancelled = true;
      recognition.stopListening();
    };
  }, [state.status, recognition]);

  // Stop recognition once the run completes and notify the host.
  useEffect(() => {
    if (state.status !== 'completed') return;
    recognition.stopListening();
    onCompletion?.();
  }, [state.status, recognition, onCompletion]);

  // Tear down adapters when the screen unmounts.
  useEffect(() => {
    return () => {
      playback.dispose();
      recognition.dispose();
    };
  }, [playback, recognition]);

  const currentItem = state.snapshot?.items[state.currentItemIndex];
  const totalItems = state.snapshot?.items.length ?? 0;

  if (state.status === 'completed') {
    return (
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>Checklist complete</Text>
        <Text>You finished “{state.snapshot?.checklistTitle}”.</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            testID="completion-restart"
            onPress={() => dispatch({ type: 'RESTART' })}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 18,
              backgroundColor: '#0a84ff',
              borderRadius: 6,
            }}
          >
            <Text style={{ color: 'white', fontWeight: '600' }}>Restart</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="completion-return"
            onPress={onExit}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 18,
              borderWidth: 1,
              borderRadius: 6,
            }}
          >
            <Text>Return to library</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '600' }}>{state.snapshot?.checklistTitle}</Text>
      <Text style={{ color: '#666' }}>
        Item {state.currentItemIndex + 1} of {totalItems}
      </Text>

      <View
        style={{
          padding: 18,
          borderWidth: 1,
          borderColor: '#ccc',
          borderRadius: 8,
          minHeight: 80,
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 22 }}>{currentItem?.text}</Text>
      </View>

      <Text testID="status-banner" style={{ color: '#666' }}>
        {state.status === 'speaking' && 'Speaking…'}
        {state.status === 'listening' && 'Listening for "next", "repeat", or "previous"…'}
        {state.status === 'manual' && 'Use the buttons below to advance.'}
      </Text>

      {!state.voiceControlAvailable && (
        <Text testID="voice-unavailable" style={{ color: '#a0431f' }}>
          Voice control unavailable — use the buttons to control playback.
        </Text>
      )}
      {!state.spokenPlaybackAvailable && (
        <Text testID="playback-unavailable" style={{ color: '#a0431f' }}>
          Spoken playback unavailable — the item text remains visible above.
        </Text>
      )}

      {state.latestRecognizedPhrase.length > 0 && (
        <View
          testID="transcript-panel"
          style={{ padding: 12, backgroundColor: '#f1f1f1', borderRadius: 6 }}
        >
          <Text style={{ color: '#444' }}>I heard:</Text>
          <Text style={{ fontSize: 16 }}>{state.latestRecognizedPhrase}</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Pressable
          accessibilityRole="button"
          testID="manual-previous"
          onPress={() => dispatch({ type: 'PREVIOUS' })}
          style={controlStyle}
        >
          <Text>Previous</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          testID="manual-repeat"
          onPress={() => dispatch({ type: 'REPEAT' })}
          style={controlStyle}
        >
          <Text>Repeat</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          testID="manual-next"
          onPress={() => dispatch({ type: 'NEXT' })}
          style={controlStyle}
        >
          <Text>Next</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          testID="manual-stop"
          onPress={onExit}
          style={[controlStyle, { borderColor: '#a0431f' }]}
        >
          <Text style={{ color: '#a0431f' }}>Stop</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const controlStyle = {
  paddingVertical: 10,
  paddingHorizontal: 16,
  borderWidth: 1,
  borderRadius: 6,
} as const;
