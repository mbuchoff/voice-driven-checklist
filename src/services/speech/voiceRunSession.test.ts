const mockStartListeningNotification = jest.fn<Promise<void>, [string]>(
  async () => undefined,
);
const mockStopListeningNotification = jest.fn<Promise<void>, []>(async () => undefined);
const mockStartAndroidBluetoothAudioRoute = jest.fn<Promise<boolean>, []>(
  async () => false,
);
const mockStopAndroidBluetoothAudioRoute = jest.fn<Promise<void>, []>(
  async () => undefined,
);

jest.mock('./foregroundService', () => ({
  startListeningNotification: (title: string) => mockStartListeningNotification(title),
  stopListeningNotification: () => mockStopListeningNotification(),
}));

jest.mock('./androidBluetoothAudioRoute', () => ({
  startAndroidBluetoothAudioRoute: () => mockStartAndroidBluetoothAudioRoute(),
  stopAndroidBluetoothAudioRoute: () => mockStopAndroidBluetoothAudioRoute(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const voiceRunSession = require('./voiceRunSession') as typeof import('./voiceRunSession');
const { startVoiceRunSession, stopVoiceRunSession } = voiceRunSession;

beforeEach(() => {
  mockStartListeningNotification.mockClear();
  mockStopListeningNotification.mockClear();
  mockStartAndroidBluetoothAudioRoute.mockClear();
  mockStopAndroidBluetoothAudioRoute.mockClear();
});

describe('voiceRunSession', () => {
  it('starts the microphone foreground service before requesting Bluetooth audio routing', async () => {
    const calls: string[] = [];
    mockStartListeningNotification.mockImplementationOnce(async () => {
      calls.push('notification');
    });
    mockStartAndroidBluetoothAudioRoute.mockImplementationOnce(async () => {
      calls.push('bluetooth-route');
      return true;
    });

    await startVoiceRunSession('Morning checklist');

    expect(mockStartListeningNotification).toHaveBeenCalledWith('Morning checklist');
    expect(calls).toEqual(['notification', 'bluetooth-route']);
  });

  it('does not request Bluetooth routing when the foreground service cannot start', async () => {
    mockStartListeningNotification.mockRejectedValueOnce(
      new Error('notification permission denied'),
    );

    await expect(startVoiceRunSession('Morning checklist')).rejects.toThrow(
      /notification permission denied/i,
    );

    expect(mockStartAndroidBluetoothAudioRoute).not.toHaveBeenCalled();
  });

  it('stops both the Bluetooth route and foreground service', async () => {
    await stopVoiceRunSession();

    expect(mockStopAndroidBluetoothAudioRoute).toHaveBeenCalledTimes(1);
    expect(mockStopListeningNotification).toHaveBeenCalledTimes(1);
  });
});
