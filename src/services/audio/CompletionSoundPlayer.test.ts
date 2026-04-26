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
  it('creates a player on first play and invokes play()', async () => {
    createAudioPlayer.mockReturnValue({ play: mockPlay, seekTo: mockSeekTo, release: mockRelease });
    const sound = new CompletionSoundPlayer();
    await sound.play();
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it('reuses the player and seeks to 0 on subsequent plays', async () => {
    createAudioPlayer.mockReturnValue({ play: mockPlay, seekTo: mockSeekTo, release: mockRelease });
    const sound = new CompletionSoundPlayer();
    await sound.play();
    await sound.play();
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockSeekTo).toHaveBeenCalledWith(0);
    expect(mockPlay).toHaveBeenCalledTimes(2);
  });

  it('swallows errors so the completion UI can still render when playback fails', async () => {
    createAudioPlayer.mockImplementation(() => {
      throw new Error('audio pipeline broken');
    });
    const sound = new CompletionSoundPlayer();
    await expect(sound.play()).resolves.toBeUndefined();
  });

  it('releases the underlying player', async () => {
    createAudioPlayer.mockReturnValue({ play: mockPlay, seekTo: mockSeekTo, release: mockRelease });
    const sound = new CompletionSoundPlayer();
    await sound.play();
    sound.release();
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('release is safe to call when nothing was ever played', () => {
    const sound = new CompletionSoundPlayer();
    expect(() => sound.release()).not.toThrow();
  });

  it('prepare creates the player exactly once', () => {
    createAudioPlayer.mockReturnValue({ play: mockPlay, seekTo: mockSeekTo, release: mockRelease });
    const sound = new CompletionSoundPlayer();
    sound.prepare();
    sound.prepare();
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it('play after prepare reuses the pre-warmed player', async () => {
    createAudioPlayer.mockReturnValue({ play: mockPlay, seekTo: mockSeekTo, release: mockRelease });
    const sound = new CompletionSoundPlayer();
    sound.prepare();
    await sound.play();
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockSeekTo).toHaveBeenCalledWith(0);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it('prepare swallows errors so completion is unaffected', () => {
    createAudioPlayer.mockImplementation(() => {
      throw new Error('audio pipeline broken');
    });
    const sound = new CompletionSoundPlayer();
    expect(() => sound.prepare()).not.toThrow();
  });
});
