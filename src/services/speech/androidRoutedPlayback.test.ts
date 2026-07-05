type NativeRouteModule = {
  isSpeechAvailable?: jest.Mock;
  speakRouted?: jest.Mock;
  stopRoutedSpeech?: jest.Mock;
};

function loadPlayback(nativeModule: NativeRouteModule | null) {
  jest.resetModules();
  jest.doMock('expo-modules-core', () => ({
    requireOptionalNativeModule: (name: string) =>
      name === 'VoiceChecklistAudioRoute' ? nativeModule : null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./androidRoutedPlayback') as typeof import('./androidRoutedPlayback');
}

describe('androidRoutedPlayback', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses native speech playback when the route module exposes it', async () => {
    const nativeModule = {
      isSpeechAvailable: jest.fn(async () => true),
      speakRouted: jest.fn(async () => undefined),
      stopRoutedSpeech: jest.fn(async () => undefined),
    };
    const { AndroidRoutedPlaybackAdapter, isAndroidRoutedPlaybackAvailable } =
      loadPlayback(nativeModule);

    expect(isAndroidRoutedPlaybackAvailable()).toBe(true);

    const adapter = new AndroidRoutedPlaybackAdapter();
    await expect(adapter.isAvailable()).resolves.toBe(true);
    await adapter.speak('Item one', { locale: 'en-US' });
    await adapter.stop();

    expect(nativeModule.isSpeechAvailable).toHaveBeenCalledTimes(1);
    expect(nativeModule.speakRouted).toHaveBeenCalledWith('Item one', 'en-US');
    expect(nativeModule.stopRoutedSpeech).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable when the native module is missing speech playback methods', () => {
    const { isAndroidRoutedPlaybackAvailable } = loadPlayback({
      isSpeechAvailable: jest.fn(),
    });

    expect(isAndroidRoutedPlaybackAvailable()).toBe(false);
  });

  it('reports unavailable when native speech availability hangs', async () => {
    jest.useFakeTimers();
    const nativeModule = {
      isSpeechAvailable: jest.fn(() => new Promise<boolean>(() => undefined)),
      speakRouted: jest.fn(async () => undefined),
      stopRoutedSpeech: jest.fn(async () => undefined),
    };
    const {
      AndroidRoutedPlaybackAdapter,
      ANDROID_ROUTED_PLAYBACK_AVAILABILITY_TIMEOUT_MS,
    } = loadPlayback(nativeModule);

    const availability = new AndroidRoutedPlaybackAdapter().isAvailable();
    await jest.advanceTimersByTimeAsync(ANDROID_ROUTED_PLAYBACK_AVAILABILITY_TIMEOUT_MS);

    await expect(availability).resolves.toBe(false);
  });
});
