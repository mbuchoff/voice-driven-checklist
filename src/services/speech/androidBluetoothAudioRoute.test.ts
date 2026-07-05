type NativeRouteModule = {
  start: jest.Mock;
  stop: jest.Mock;
};

function loadRoute(nativeModule: NativeRouteModule | null) {
  jest.resetModules();
  jest.doMock('expo-modules-core', () => ({
    // Name-aware so the test fails if the wrapper requests the wrong module name.
    requireOptionalNativeModule: (name: string) =>
      name === 'VoiceChecklistAudioRoute' ? nativeModule : null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./androidBluetoothAudioRoute') as typeof import('./androidBluetoothAudioRoute');
}

describe('androidBluetoothAudioRoute', () => {
  it('starts and stops the native Bluetooth audio route when the module is present', async () => {
    const nativeModule = {
      start: jest.fn(async () => true),
      stop: jest.fn(async () => undefined),
    };
    const { startAndroidBluetoothAudioRoute, stopAndroidBluetoothAudioRoute } =
      loadRoute(nativeModule);

    await startAndroidBluetoothAudioRoute();
    await stopAndroidBluetoothAudioRoute();

    expect(nativeModule.start).toHaveBeenCalledTimes(1);
    expect(nativeModule.stop).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the native module is unavailable (iOS, web, or not built in)', async () => {
    const { startAndroidBluetoothAudioRoute, stopAndroidBluetoothAudioRoute } =
      loadRoute(null);

    await expect(startAndroidBluetoothAudioRoute()).resolves.toBeUndefined();
    await expect(stopAndroidBluetoothAudioRoute()).resolves.toBeUndefined();
  });

  it('rejects when the native module cannot route away from the phone earpiece', async () => {
    const nativeModule = {
      start: jest.fn(async () => false),
      stop: jest.fn(async () => undefined),
    };
    const { startAndroidBluetoothAudioRoute } =
      loadRoute(nativeModule);

    await expect(startAndroidBluetoothAudioRoute()).rejects.toThrow(/audio route unavailable/i);
  });

  it('rejects when the native route rejects', async () => {
    const nativeModule = {
      start: jest.fn(async () => {
        throw new Error('route unavailable');
      }),
      stop: jest.fn(async () => {
        throw new Error('route unavailable');
      }),
    };
    const { startAndroidBluetoothAudioRoute, stopAndroidBluetoothAudioRoute } =
      loadRoute(nativeModule);

    await expect(startAndroidBluetoothAudioRoute()).rejects.toThrow(/route unavailable/i);
    await expect(stopAndroidBluetoothAudioRoute()).resolves.toBeUndefined();

    expect(nativeModule.start).toHaveBeenCalledTimes(1);
    expect(nativeModule.stop).toHaveBeenCalledTimes(1);
  });
});
