type ForegroundEvent = {
  type: number;
  detail: { pressAction?: { id: string } };
};

let mockForegroundObserver: ((event: ForegroundEvent) => void) | null = null;
let mockBackgroundObserver: ((event: ForegroundEvent) => Promise<void>) | null = null;
const mockUnsubscribe = jest.fn();
const mockNotifee = {
  createChannel: jest.fn(async () => 'voice-checklist-listening'),
  displayNotification: jest.fn(async () => 'voice-checklist-listening'),
  onBackgroundEvent: jest.fn((observer: (event: ForegroundEvent) => Promise<void>) => {
    mockBackgroundObserver = observer;
  }),
  onForegroundEvent: jest.fn((observer: (event: ForegroundEvent) => void) => {
    mockForegroundObserver = observer;
    return mockUnsubscribe;
  }),
  registerForegroundService: jest.fn(),
  requestPermission: jest.fn(async () => ({ authorizationStatus: 1 })),
  stopForegroundService: jest.fn(async () => undefined),
};

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: mockNotifee,
  AndroidForegroundServiceType: {
    FOREGROUND_SERVICE_TYPE_MICROPHONE: 128,
  },
  AndroidImportance: {
    HIGH: 4,
  },
  EventType: {
    ACTION_PRESS: 1,
  },
}));

function loadService() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./foregroundService') as typeof import('./foregroundService');
}

beforeEach(() => {
  mockForegroundObserver = null;
  mockBackgroundObserver = null;
  mockUnsubscribe.mockClear();
  mockNotifee.createChannel.mockClear();
  mockNotifee.displayNotification.mockClear();
  mockNotifee.onBackgroundEvent.mockClear();
  mockNotifee.onForegroundEvent.mockClear();
  mockNotifee.registerForegroundService.mockClear();
  mockNotifee.requestPermission.mockClear();
  mockNotifee.stopForegroundService.mockClear();
});

describe('foreground speech service', () => {
  it('registers the foreground service task once', async () => {
    const { registerListeningService } = await loadService();

    registerListeningService();
    registerListeningService();

    expect(mockNotifee.registerForegroundService).toHaveBeenCalledTimes(1);
    expect(mockNotifee.onBackgroundEvent).toHaveBeenCalledTimes(1);
    expect(mockNotifee.onForegroundEvent).toHaveBeenCalledTimes(1);
  });

  it('starts an ongoing microphone foreground-service notification', async () => {
    const { startListeningNotification } = await loadService();

    await startListeningNotification('Morning checklist');

    expect(mockNotifee.requestPermission).toHaveBeenCalledTimes(1);
    expect(mockNotifee.createChannel).toHaveBeenCalledWith({
      id: 'voice-checklist-listening',
      name: 'Voice checklist listening',
      importance: 4,
    });
    expect(mockNotifee.displayNotification).toHaveBeenCalledWith({
      id: 'voice-checklist-listening',
      title: 'Listening - Morning checklist',
      body: 'Say next, repeat, or previous',
      android: expect.objectContaining({
        asForegroundService: true,
        channelId: 'voice-checklist-listening',
        foregroundServiceTypes: [128],
        ongoing: true,
        pressAction: { id: 'open' },
      }),
    });
  });

  it('keeps the registered task alive until the notification stops', async () => {
    const { registerListeningService, stopListeningNotification } = await loadService();
    registerListeningService();
    const runner = mockNotifee.registerForegroundService.mock.calls[0][0];

    let resolved = false;
    const pending = runner({}).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    await stopListeningNotification();
    await pending;

    expect(resolved).toBe(true);
    expect(mockNotifee.stopForegroundService).toHaveBeenCalledTimes(1);
  });

  it('routes the notification Stop action to the active run callback', async () => {
    const { registerListeningService, setListeningNotificationStopHandler } =
      await loadService();
    const onStop = jest.fn();

    registerListeningService();
    const clearHandler = setListeningNotificationStopHandler(onStop);
    mockForegroundObserver?.({ type: 1, detail: { pressAction: { id: 'stop' } } });
    clearHandler();
    mockForegroundObserver?.({ type: 1, detail: { pressAction: { id: 'stop' } } });

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('routes the notification Stop action from background events', async () => {
    const { registerListeningService, setListeningNotificationStopHandler } =
      await loadService();
    const onStop = jest.fn();

    registerListeningService();
    setListeningNotificationStopHandler(onStop);
    await mockBackgroundObserver?.({ type: 1, detail: { pressAction: { id: 'stop' } } });

    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
