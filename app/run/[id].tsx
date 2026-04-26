import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Text, View } from 'react-native';

import { useDatabase } from '@/src/db/DatabaseProvider';
import { RunScreen } from '@/src/features/run/RunScreen';
import { createSnapshot } from '@/src/features/run/snapshot';
import type { ChecklistRunSnapshot } from '@/src/features/run/types';
import { getChecklist } from '@/src/features/checklists/repository';
import { CompletionSoundPlayer } from '@/src/services/audio/CompletionSoundPlayer';
import { createSpeechAdapters } from '@/src/services/speech/createSpeechAdapters';
import {
  setListeningNotificationStopHandler,
  startListeningNotification,
  stopListeningNotification,
} from '@/src/services/speech/foregroundService';

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
  const completionSound = useMemo(() => new CompletionSoundPlayer(), []);

  useEffect(() => {
    return () => completionSound.release();
  }, [completionSound]);

  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });

  const stopRunResources = useCallback(async () => {
    await Promise.allSettled([
      adapters.playback.stop(),
      adapters.recognition.stopListening(),
      stopListeningNotification(),
    ]);
  }, [adapters]);

  const exitRun = useCallback(async () => {
    await stopRunResources();
    router.replace('/');
  }, [router, stopRunResources]);

  const stopRunResourcesInBackground = useCallback(() => {
    void stopRunResources();
  }, [stopRunResources]);

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
      return stopRunResourcesInBackground;
    }, [stopRunResourcesInBackground]),
  );

  // Web tab-close: best-effort stop on pagehide.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    window.addEventListener('pagehide', stopRunResourcesInBackground);
    window.addEventListener('beforeunload', stopRunResourcesInBackground);
    return () => {
      window.removeEventListener('pagehide', stopRunResourcesInBackground);
      window.removeEventListener('beforeunload', stopRunResourcesInBackground);
    };
  }, [stopRunResourcesInBackground]);

  // Android hardware-back: discard the run by exiting the screen.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      void exitRun();
      return true;
    });
    return () => sub.remove();
  }, [exitRun]);

  useEffect(() => setListeningNotificationStopHandler(exitRun), [exitRun]);

  const checklistTitle = loadState.kind === 'ready' ? loadState.snapshot.checklistTitle : '';
  const startVoiceRunNotification = useCallback(
    () => startListeningNotification(checklistTitle),
    [checklistTitle],
  );

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
      onExit={exitRun}
      onCompletion={() => completionSound.play()}
      onVoiceRunStart={startVoiceRunNotification}
      onVoiceRunStop={stopListeningNotification}
    />
  );
}
