import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Platform, Text, View } from 'react-native';

import { useDatabase } from '@/src/db/DatabaseProvider';
import { RunScreen } from '@/src/features/run/RunScreen';
import { createSnapshot } from '@/src/features/run/snapshot';
import type { ChecklistRunSnapshot } from '@/src/features/run/types';
import { getChecklist } from '@/src/features/checklists/repository';
import { createSpeechAdapters } from '@/src/services/speech/createSpeechAdapters';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'empty' }
  | {
      kind: 'ready';
      snapshot: ChecklistRunSnapshot;
      initialAvailability: { spokenPlaybackAvailable: boolean; voiceControlAvailable: boolean };
    };

export default function RunRoute() {
  const router = useRouter();
  const db = useDatabase();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Speech adapters live for the lifetime of the route. createSpeechAdapters
  // returns either real expo-speech / expo-speech-recognition wrappers, or
  // the deterministic fakes when EXPO_PUBLIC_USE_TEST_SPEECH_ADAPTER=true.
  const adapters = useMemo(() => createSpeechAdapters(), []);

  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const checklist = await getChecklist(db, id);
      if (cancelled) return;
      if (!checklist) {
        setLoadState({ kind: 'missing' });
        return;
      }
      if (checklist.items.length === 0) {
        setLoadState({ kind: 'empty' });
        return;
      }
      const snapshot = createSnapshot(checklist);
      const playbackAvail = await adapters.playback.isAvailable();
      let voiceAvail = await adapters.recognition.isAvailable();
      if (voiceAvail) {
        const perm = await adapters.recognition.requestPermissionsIfNeeded();
        if (perm !== 'granted') voiceAvail = false;
      }
      if (cancelled) return;
      setLoadState({
        kind: 'ready',
        snapshot,
        initialAvailability: {
          spokenPlaybackAvailable: playbackAvail,
          voiceControlAvailable: voiceAvail,
        },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [adapters, db, id]);

  // Route-leave: dispose adapters when leaving (RunScreen also disposes on
  // unmount, but back-to-back navigations may dispose before unmount fires).
  useFocusEffect(
    useCallback(() => {
      return () => {
        adapters.playback.stop();
        adapters.recognition.stopListening();
      };
    }, [adapters]),
  );

  // App-lifecycle: stop in-flight speech and recognition when backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        adapters.playback.stop();
        adapters.recognition.stopListening();
      }
    });
    return () => sub.remove();
  }, [adapters]);

  // Web tab-close: best-effort stop on pagehide.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = () => {
      adapters.playback.stop();
      adapters.recognition.stopListening();
    };
    window.addEventListener('pagehide', handler);
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('pagehide', handler);
      window.removeEventListener('beforeunload', handler);
    };
  }, [adapters]);

  // Android hardware-back: discard the run by exiting the screen.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      adapters.playback.stop();
      adapters.recognition.stopListening();
      router.replace('/');
      return true;
    });
    return () => sub.remove();
  }, [adapters, router]);

  if (loadState.kind === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (loadState.kind === 'missing') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text>That checklist no longer exists.</Text>
      </View>
    );
  }

  if (loadState.kind === 'empty') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text>This checklist has no items. Add at least one before starting.</Text>
      </View>
    );
  }

  return (
    <RunScreen
      snapshot={loadState.snapshot}
      playback={adapters.playback}
      recognition={adapters.recognition}
      initialAvailability={loadState.initialAvailability}
      onExit={() => router.replace('/')}
    />
  );
}
