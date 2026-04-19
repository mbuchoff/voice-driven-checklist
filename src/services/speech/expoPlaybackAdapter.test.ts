import { ExpoPlaybackAdapter } from './expoPlaybackAdapter';

jest.mock('expo-speech', () => ({
  __esModule: true,
  speak: jest.fn(),
  stop: jest.fn(async () => undefined),
  getAvailableVoicesAsync: jest.fn(),
}));

const Speech = jest.requireMock('expo-speech') as {
  speak: jest.Mock;
  stop: jest.Mock;
  getAvailableVoicesAsync: jest.Mock;
};

beforeEach(() => {
  Speech.speak.mockReset();
  Speech.stop.mockReset();
  Speech.getAvailableVoicesAsync.mockReset();
  Speech.stop.mockResolvedValue(undefined);
});

describe('ExpoPlaybackAdapter.isAvailable', () => {
  it('returns true when at least one voice is available', async () => {
    Speech.getAvailableVoicesAsync.mockResolvedValue([{ identifier: 'v1' }]);
    expect(await new ExpoPlaybackAdapter().isAvailable()).toBe(true);
  });

  it('returns false when no voices are available', async () => {
    Speech.getAvailableVoicesAsync.mockResolvedValue([]);
    expect(await new ExpoPlaybackAdapter().isAvailable()).toBe(false);
  });

  it('returns false when the underlying call throws', async () => {
    Speech.getAvailableVoicesAsync.mockRejectedValue(new Error('no tts'));
    expect(await new ExpoPlaybackAdapter().isAvailable()).toBe(false);
  });
});

describe('ExpoPlaybackAdapter.speak', () => {
  it('resolves when expo-speech reports onDone', async () => {
    Speech.speak.mockImplementation((_text: string, opts: { onDone?: () => void }) => {
      opts.onDone?.();
    });
    await expect(
      new ExpoPlaybackAdapter().speak('Hi', { locale: 'en-US' }),
    ).resolves.toBeUndefined();
    expect(Speech.speak).toHaveBeenCalledWith(
      'Hi',
      expect.objectContaining({ language: 'en-US' }),
    );
  });

  it('also resolves when expo-speech reports onStopped', async () => {
    Speech.speak.mockImplementation((_text: string, opts: { onStopped?: () => void }) => {
      opts.onStopped?.();
    });
    await expect(
      new ExpoPlaybackAdapter().speak('Bye', { locale: 'en-US' }),
    ).resolves.toBeUndefined();
  });

  it('rejects when expo-speech reports onError', async () => {
    Speech.speak.mockImplementation((_text: string, opts: { onError?: (e: unknown) => void }) => {
      opts.onError?.(new Error('boom'));
    });
    await expect(
      new ExpoPlaybackAdapter().speak('Bad', { locale: 'en-US' }),
    ).rejects.toThrow('boom');
  });
});

describe('ExpoPlaybackAdapter.stop and dispose', () => {
  it('delegates stop to expo-speech', async () => {
    await new ExpoPlaybackAdapter().stop();
    expect(Speech.stop).toHaveBeenCalled();
  });

  it('calls Speech.stop on dispose', async () => {
    await new ExpoPlaybackAdapter().dispose();
    expect(Speech.stop).toHaveBeenCalled();
  });
});
