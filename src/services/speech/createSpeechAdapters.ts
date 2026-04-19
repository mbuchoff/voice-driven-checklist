import type { SpeechPlaybackAdapter, SpeechRecognitionAdapter } from './adapters';
import { ExpoPlaybackAdapter } from './expoPlaybackAdapter';
import { ExpoRecognitionAdapter } from './expoRecognitionAdapter';
import { FakeSpeechPlaybackAdapter, FakeSpeechRecognitionAdapter } from './fakes';

export type SpeechAdapters = {
  playback: SpeechPlaybackAdapter;
  recognition: SpeechRecognitionAdapter;
};

export function isTestSpeechAdapterEnabled(): boolean {
  return process.env.EXPO_PUBLIC_USE_TEST_SPEECH_ADAPTER === 'true';
}

export function createSpeechAdapters(): SpeechAdapters {
  if (isTestSpeechAdapterEnabled()) {
    const playback = new FakeSpeechPlaybackAdapter();
    const recognition = new FakeSpeechRecognitionAdapter();
    exposeTestHandle(playback, recognition);
    return { playback, recognition };
  }
  return {
    playback: new ExpoPlaybackAdapter(),
    recognition: new ExpoRecognitionAdapter(),
  };
}

type TestHandle = {
  completePlayback: () => void;
  failPlayback: (error?: unknown) => void;
  emitPhrase: (phrase: string) => void;
  emitError: (error?: string) => void;
  getSpoken: () => string[];
  isListening: () => boolean;
  setPlaybackAvailable: (value: boolean) => void;
  setRecognitionAvailable: (value: boolean) => void;
};

declare global {
  var __testSpeech: TestHandle | undefined;
}

function exposeTestHandle(
  playback: FakeSpeechPlaybackAdapter,
  recognition: FakeSpeechRecognitionAdapter,
): void {
  const handle: TestHandle = {
    completePlayback: () => playback.completePlayback(),
    failPlayback: (err) => playback.failPlayback(err),
    emitPhrase: (phrase) => recognition.emitResult({ transcript: phrase, isFinal: true }),
    emitError: (err = 'forced-error') => recognition.emitError(err),
    getSpoken: () => playback.spoken.slice(),
    isListening: () => recognition.isListening(),
    setPlaybackAvailable: (value) => playback.setAvailable(value),
    setRecognitionAvailable: (value) => recognition.setAvailable(value),
  };
  globalThis.__testSpeech = handle;
}
