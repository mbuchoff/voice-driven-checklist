import { ExpoRecognitionAdapter } from './expoRecognitionAdapter';

type Listener = (event: unknown) => void;

const mockListeners = new Map<string, Listener[]>();
const mockRemoved = new Set<Listener>();

function emit(name: string, event: unknown) {
  const subs = mockListeners.get(name) ?? [];
  for (const fn of subs) {
    if (!mockRemoved.has(fn)) fn(event);
  }
}

jest.mock('expo-speech-recognition', () => ({
  __esModule: true,
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: jest.fn(),
    requestPermissionsAsync: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    addListener: jest.fn((name: string, listener: Listener) => {
      const subs = mockListeners.get(name) ?? [];
      subs.push(listener);
      mockListeners.set(name, subs);
      return {
        remove: () => {
          mockRemoved.add(listener);
        },
      };
    }),
  },
}));

const Module = jest.requireMock('expo-speech-recognition').ExpoSpeechRecognitionModule as {
  isRecognitionAvailable: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  addListener: jest.Mock;
};

beforeEach(() => {
  Module.isRecognitionAvailable.mockReset();
  Module.requestPermissionsAsync.mockReset();
  Module.start.mockReset();
  Module.stop.mockReset();
  Module.addListener.mockClear();
  mockListeners.clear();
  mockRemoved.clear();
});

describe('ExpoRecognitionAdapter.isAvailable', () => {
  it('returns whatever the module reports', async () => {
    Module.isRecognitionAvailable.mockReturnValue(true);
    expect(await new ExpoRecognitionAdapter().isAvailable()).toBe(true);
    Module.isRecognitionAvailable.mockReturnValue(false);
    expect(await new ExpoRecognitionAdapter().isAvailable()).toBe(false);
  });

  it('returns false when the underlying call throws', async () => {
    Module.isRecognitionAvailable.mockImplementation(() => {
      throw new Error('not supported');
    });
    expect(await new ExpoRecognitionAdapter().isAvailable()).toBe(false);
  });
});

describe('ExpoRecognitionAdapter.requestPermissionsIfNeeded', () => {
  it('returns granted when the module reports granted', async () => {
    Module.requestPermissionsAsync.mockResolvedValue({ granted: true });
    expect(await new ExpoRecognitionAdapter().requestPermissionsIfNeeded()).toBe('granted');
  });

  it('returns denied when the module reports denied', async () => {
    Module.requestPermissionsAsync.mockResolvedValue({ granted: false });
    expect(await new ExpoRecognitionAdapter().requestPermissionsIfNeeded()).toBe('denied');
  });

  it('returns unavailable when the module throws', async () => {
    Module.requestPermissionsAsync.mockRejectedValue(new Error('boom'));
    expect(await new ExpoRecognitionAdapter().requestPermissionsIfNeeded()).toBe('unavailable');
  });
});

describe('ExpoRecognitionAdapter.startListening', () => {
  it('starts the module with the requested locale and forwards results', async () => {
    const adapter = new ExpoRecognitionAdapter();
    const onResult = jest.fn();
    const onError = jest.fn();

    await adapter.startListening({ locale: 'en-US', onResult, onError });

    expect(Module.start).toHaveBeenCalledWith({
      lang: 'en-US',
      continuous: false,
      interimResults: true,
      maxAlternatives: 1,
      contextualStrings: ['next', 'repeat', 'previous'],
      androidIntentOptions: {
        EXTRA_LANGUAGE_MODEL: 'web_search',
      },
      iosTaskHint: 'confirmation',
      iosCategory: {
        category: 'playAndRecord',
        categoryOptions: ['mixWithOthers', 'defaultToSpeaker', 'allowBluetooth'],
        mode: 'spokenAudio',
      },
    });

    emit('result', {
      isFinal: true,
      results: [{ transcript: 'next', confidence: 0.9, segments: [] }],
    });

    expect(onResult).toHaveBeenCalledWith({ transcript: 'next', isFinal: true });
  });

  it('forwards error events', async () => {
    const adapter = new ExpoRecognitionAdapter();
    const onError = jest.fn();
    await adapter.startListening({ locale: 'en-US', onResult: jest.fn(), onError });

    emit('error', { error: 'not-allowed', message: 'mic denied' });

    expect(onError).toHaveBeenCalledWith('not-allowed');
  });

  it('treats an unexpected end event as recoverable', async () => {
    const adapter = new ExpoRecognitionAdapter();
    const onError = jest.fn();
    await adapter.startListening({ locale: 'en-US', onResult: jest.fn(), onError });

    emit('end', null);

    expect(onError).toHaveBeenCalledWith('aborted');
  });

  it('uses the last partial transcript when Android finalizes a segment as nomatch', async () => {
    const adapter = new ExpoRecognitionAdapter();
    const onResult = jest.fn();
    await adapter.startListening({ locale: 'en-US', onResult, onError: jest.fn() });

    emit('result', {
      isFinal: false,
      results: [{ transcript: 'next', confidence: 0, segments: [] }],
    });
    emit('nomatch', null);

    expect(onResult).toHaveBeenCalledWith({ transcript: 'next', isFinal: false });
    expect(onResult).toHaveBeenCalledWith({ transcript: 'next', isFinal: true });
  });

  it('does not reuse an old partial after a final result arrives', async () => {
    const adapter = new ExpoRecognitionAdapter();
    const onResult = jest.fn();
    await adapter.startListening({ locale: 'en-US', onResult, onError: jest.fn() });

    emit('result', {
      isFinal: false,
      results: [{ transcript: 'next', confidence: 0, segments: [] }],
    });
    emit('result', {
      isFinal: true,
      results: [{ transcript: 'hello', confidence: 0.9, segments: [] }],
    });
    emit('nomatch', null);

    expect(onResult).toHaveBeenCalledTimes(2);
    expect(onResult).toHaveBeenLastCalledWith({ transcript: 'hello', isFinal: true });
  });

  it('removes its listeners and stops the module on stopListening', async () => {
    const adapter = new ExpoRecognitionAdapter();
    const onResult = jest.fn();
    await adapter.startListening({ locale: 'en-US', onResult, onError: jest.fn() });

    await adapter.stopListening();

    expect(Module.stop).toHaveBeenCalled();
    emit('result', {
      isFinal: true,
      results: [{ transcript: 'next', confidence: 0.9, segments: [] }],
    });
    expect(onResult).not.toHaveBeenCalled();
  });
});
