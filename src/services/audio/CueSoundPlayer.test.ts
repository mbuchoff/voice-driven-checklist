import { createAudioPlayer } from 'expo-audio';

import { CueSoundPlayer } from './CueSoundPlayer';

jest.mock('expo-audio', () => ({
  __esModule: true,
  createAudioPlayer: jest.fn(),
}));

const mockedCreateAudioPlayer = createAudioPlayer as jest.MockedFunction<
  typeof createAudioPlayer
>;

function audioPlayer() {
  return {
    play: jest.fn(),
    seekTo: jest.fn(async () => undefined),
    release: jest.fn(),
  };
}

describe('CueSoundPlayer', () => {
  beforeEach(() => mockedCreateAudioPlayer.mockReset());

  it('prepares one distinct player for every action in an audible family', () => {
    mockedCreateAudioPlayer.mockImplementation(() => audioPlayer() as never);
    const cues = new CueSoundPlayer();

    cues.prepare('chime');

    expect(mockedCreateAudioPlayer).toHaveBeenCalledTimes(4);
  });

  it('plays the requested action from the prepared family', async () => {
    const players = [audioPlayer(), audioPlayer(), audioPlayer(), audioPlayer()];
    mockedCreateAudioPlayer.mockImplementation(() => players.shift() as never);
    const cues = new CueSoundPlayer();
    cues.prepare('wood');
    const prepared = mockedCreateAudioPlayer.mock.results.map((result) => result.value);

    await cues.play('previous');

    expect(prepared[1].seekTo).toHaveBeenCalledWith(0);
    expect(prepared[1].play).toHaveBeenCalledTimes(1);
    expect(prepared[0].play).not.toHaveBeenCalled();
    expect(prepared[2].play).not.toHaveBeenCalled();
    expect(prepared[3].play).not.toHaveBeenCalled();
  });

  it('releases the current players before preparing a different family', () => {
    const players = Array.from({ length: 8 }, audioPlayer);
    mockedCreateAudioPlayer.mockImplementation(() => players.shift() as never);
    const cues = new CueSoundPlayer();
    cues.prepare('chime');
    const firstFamily = mockedCreateAudioPlayer.mock.results.map((result) => result.value);

    cues.prepare('ping');

    expect(firstFamily).toHaveLength(4);
    expect(firstFamily.every((player) => player.release.mock.calls.length === 1)).toBe(true);
    expect(mockedCreateAudioPlayer).toHaveBeenCalledTimes(8);
  });

  it('keeps Quiet silent and releases any prepared audible family', async () => {
    mockedCreateAudioPlayer.mockImplementation(() => audioPlayer() as never);
    const cues = new CueSoundPlayer();
    cues.prepare('ping');
    const prepared = mockedCreateAudioPlayer.mock.results.map((result) => result.value);

    cues.prepare('quiet');
    await cues.play('complete');

    expect(prepared.every((player) => player.release.mock.calls.length === 1)).toBe(true);
    expect(prepared.every((player) => player.play.mock.calls.length === 0)).toBe(true);
    expect(mockedCreateAudioPlayer).toHaveBeenCalledTimes(4);
  });

  it('swallows setup and playback failures so run controls remain usable', async () => {
    mockedCreateAudioPlayer.mockImplementationOnce(() => {
      throw new Error('audio unavailable');
    });
    const cues = new CueSoundPlayer();

    expect(() => cues.prepare('chime')).not.toThrow();
    await expect(cues.play('next')).resolves.toBeUndefined();
  });
});
