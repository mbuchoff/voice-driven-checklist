import { CompletionSoundPlayer } from './CompletionSoundPlayer';

jest.mock('expo-audio', () => ({
  __esModule: true,
  createAudioPlayer: jest.fn(),
}));

const mockPlay = jest.fn();
const mockSeekTo = jest.fn(async () => undefined);
const mockRelease = jest.fn();
const createAudioPlayer = jest.requireMock('expo-audio').createAudioPlayer as jest.Mock;

beforeEach(() => {
  createAudioPlayer.mockReset();
  mockPlay.mockReset();
  mockSeekTo.mockReset();
  mockSeekTo.mockResolvedValue(undefined);
  mockRelease.mockReset();
});

describe('CompletionSoundPlayer', () => {
  it('prepare creates the player exactly once across repeat calls', () => {
    createAudioPlayer.mockReturnValue({ play: mockPlay, seekTo: mockSeekTo, release: mockRelease });
    const sound = new CompletionSoundPlayer();
    sound.prepare();
    sound.prepare();
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it('play seeks to 0 and starts the pre-warmed player', async () => {
    createAudioPlayer.mockReturnValue({ play: mockPlay, seekTo: mockSeekTo, release: mockRelease });
    const sound = new CompletionSoundPlayer();
    sound.prepare();
    await sound.play();
    expect(mockSeekTo).toHaveBeenCalledWith(0);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it('play is a no-op when prepare was never called or failed', async () => {
    const sound = new CompletionSoundPlayer();
    await expect(sound.play()).resolves.toBeUndefined();
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('prepare swallows construction errors so completion UI still renders', () => {
    createAudioPlayer.mockImplementation(() => {
      throw new Error('audio pipeline broken');
    });
    const sound = new CompletionSoundPlayer();
    expect(() => sound.prepare()).not.toThrow();
  });

  it('play swallows runtime errors so completion UI still renders', async () => {
    createAudioPlayer.mockReturnValue({
      play: jest.fn(() => {
        throw new Error('audio pipeline broken');
      }),
      seekTo: mockSeekTo,
      release: mockRelease,
    });
    const sound = new CompletionSoundPlayer();
    sound.prepare();
    await expect(sound.play()).resolves.toBeUndefined();
  });

  it('release tears down the underlying player', () => {
    createAudioPlayer.mockReturnValue({ play: mockPlay, seekTo: mockSeekTo, release: mockRelease });
    const sound = new CompletionSoundPlayer();
    sound.prepare();
    sound.release();
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('release is safe to call when prepare was never called', () => {
    const sound = new CompletionSoundPlayer();
    expect(() => sound.release()).not.toThrow();
  });
});
