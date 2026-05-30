type NativeRouteModule = {
  start: jest.Mock;
  stop: jest.Mock;
};

function loadRoute(platform: 'android' | 'ios', nativeModule?: NativeRouteModule) {
  jest.resetModules();
  jest.doMock('react-native', () => ({
    NativeModules: nativeModule ? { VoiceChecklistAudioRoute: nativeModule } : {},
    Platform: { OS: platform },
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./androidBluetoothAudioRoute') as typeof import('./androidBluetoothAudioRoute');
}

describe('androidBluetoothAudioRoute', () => {
  it('starts and stops the native Bluetooth audio route on Android', async () => {
    const nativeModule = {
      start: jest.fn(async () => true),
      stop: jest.fn(async () => undefined),
    };
    const { startAndroidBluetoothAudioRoute, stopAndroidBluetoothAudioRoute } =
      loadRoute('android', nativeModule);

    await startAndroidBluetoothAudioRoute();
    await stopAndroidBluetoothAudioRoute();

    expect(nativeModule.start).toHaveBeenCalledTimes(1);
    expect(nativeModule.stop).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the platform is not Android', async () => {
    const nativeModule = {
      start: jest.fn(async () => true),
      stop: jest.fn(async () => undefined),
    };
    const { startAndroidBluetoothAudioRoute, stopAndroidBluetoothAudioRoute } =
      loadRoute('ios', nativeModule);

    await startAndroidBluetoothAudioRoute();
    await stopAndroidBluetoothAudioRoute();

    expect(nativeModule.start).not.toHaveBeenCalled();
    expect(nativeModule.stop).not.toHaveBeenCalled();
  });

  it('stays usable when the native route rejects', async () => {
    const nativeModule = {
      start: jest.fn(async () => {
        throw new Error('route unavailable');
      }),
      stop: jest.fn(async () => {
        throw new Error('route unavailable');
      }),
    };
    const { startAndroidBluetoothAudioRoute, stopAndroidBluetoothAudioRoute } =
      loadRoute('android', nativeModule);

    await expect(startAndroidBluetoothAudioRoute()).resolves.toBeUndefined();
    await expect(stopAndroidBluetoothAudioRoute()).resolves.toBeUndefined();

    expect(nativeModule.start).toHaveBeenCalledTimes(1);
    expect(nativeModule.stop).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the native module is missing', async () => {
    const { startAndroidBluetoothAudioRoute, stopAndroidBluetoothAudioRoute } =
      loadRoute('android');

    await expect(startAndroidBluetoothAudioRoute()).resolves.toBeUndefined();
    await expect(stopAndroidBluetoothAudioRoute()).resolves.toBeUndefined();
  });
});
