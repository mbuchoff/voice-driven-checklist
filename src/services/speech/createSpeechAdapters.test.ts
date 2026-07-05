import {
  createSpeechAdapters,
  isTestSpeechAdapterEnabled,
} from './createSpeechAdapters';
import { ExpoPlaybackAdapter } from './expoPlaybackAdapter';
import { ExpoRecognitionAdapter } from './expoRecognitionAdapter';
import {
  FakeSpeechPlaybackAdapter,
  FakeSpeechRecognitionAdapter,
} from './fakes';

jest.mock('expo-speech', () => ({
  __esModule: true,
  speak: jest.fn(),
  stop: jest.fn(async () => undefined),
  getAvailableVoicesAsync: jest.fn(async () => []),
}));

jest.mock('expo-speech-recognition', () => ({
  __esModule: true,
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: jest.fn(() => false),
    requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
    start: jest.fn(),
    stop: jest.fn(),
    addListener: jest.fn(() => ({ remove: () => undefined })),
  },
}));

jest.mock('./androidRoutedPlayback', () => ({
  AndroidRoutedPlaybackAdapter: class AndroidRoutedPlaybackAdapter {},
  isAndroidRoutedPlaybackAvailable: jest.fn(() => false),
}));

const ORIGINAL = process.env.EXPO_PUBLIC_USE_TEST_SPEECH_ADAPTER;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.EXPO_PUBLIC_USE_TEST_SPEECH_ADAPTER;
  } else {
    process.env.EXPO_PUBLIC_USE_TEST_SPEECH_ADAPTER = ORIGINAL;
  }
  delete (globalThis as Record<string, unknown>).__testSpeech;
});

describe('createSpeechAdapters', () => {
  it('returns the production adapters by default', () => {
    delete process.env.EXPO_PUBLIC_USE_TEST_SPEECH_ADAPTER;
    expect(isTestSpeechAdapterEnabled()).toBe(false);
    const { playback, recognition } = createSpeechAdapters();
    expect(playback).toBeInstanceOf(ExpoPlaybackAdapter);
    expect(recognition).toBeInstanceOf(ExpoRecognitionAdapter);
    expect((globalThis as Record<string, unknown>).__testSpeech).toBeUndefined();
  });

  it('returns fake adapters and exposes a global test handle when the env var is "true"', () => {
    process.env.EXPO_PUBLIC_USE_TEST_SPEECH_ADAPTER = 'true';
    expect(isTestSpeechAdapterEnabled()).toBe(true);

    const { playback, recognition } = createSpeechAdapters();
    expect(playback).toBeInstanceOf(FakeSpeechPlaybackAdapter);
    expect(recognition).toBeInstanceOf(FakeSpeechRecognitionAdapter);

    const handle = (globalThis as { __testSpeech?: Record<string, unknown> }).__testSpeech;
    expect(handle).toBeDefined();
    expect(typeof handle?.completePlayback).toBe('function');
    expect(typeof handle?.emitPhrase).toBe('function');
  });

  it('uses routed Android playback when the native module exposes speech playback', () => {
    delete process.env.EXPO_PUBLIC_USE_TEST_SPEECH_ADAPTER;
    const routedPlayback = jest.requireMock('./androidRoutedPlayback') as {
      AndroidRoutedPlaybackAdapter: new () => unknown;
      isAndroidRoutedPlaybackAvailable: jest.Mock;
    };
    routedPlayback.isAndroidRoutedPlaybackAvailable.mockReturnValue(true);

    const { playback, recognition } = createSpeechAdapters();

    expect(playback).toBeInstanceOf(routedPlayback.AndroidRoutedPlaybackAdapter);
    expect(recognition).toBeInstanceOf(ExpoRecognitionAdapter);
  });
});
