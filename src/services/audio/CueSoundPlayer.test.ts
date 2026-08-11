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
  afterEach(() => jest.useRealTimers());

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

    await expect(cues.play('previous')).resolves.toBe(true);

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
    await expect(cues.play('complete')).resolves.toBe(false);

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
    await expect(cues.play('next')).resolves.toBe(false);
  });

  it('retries the same family after an interrupted setup', async () => {
    const partialPlayer = audioPlayer();
    mockedCreateAudioPlayer
      .mockReturnValueOnce(partialPlayer as never)
      .mockImplementationOnce(() => {
        throw new Error('audio unavailable');
      });
    const cues = new CueSoundPlayer();

    cues.prepare('chime');
    const retryPlayers = Array.from({ length: 4 }, audioPlayer);
    mockedCreateAudioPlayer.mockImplementation(() => retryPlayers.shift() as never);
    cues.prepare('chime');
    const prepared = mockedCreateAudioPlayer.mock.results
      .slice(2)
      .map((result) => result.value);

    await cues.play('next');

    expect(partialPlayer.release).toHaveBeenCalledTimes(1);
    expect(prepared).toHaveLength(4);
    expect(prepared[0].play).toHaveBeenCalledTimes(1);
  });

  it('abandons a cue that cannot start so it cannot block speech indefinitely', async () => {
    jest.useFakeTimers();
    const stalledPlayer = audioPlayer();
    stalledPlayer.seekTo.mockImplementation(() => new Promise(() => undefined));
    const players = [stalledPlayer, audioPlayer(), audioPlayer(), audioPlayer()];
    mockedCreateAudioPlayer.mockImplementation(() => players.shift() as never);
    const cues = new CueSoundPlayer();
    cues.prepare('chime');

    const started = cues.play('next');
    await jest.advanceTimersByTimeAsync(1000);

    await expect(started).resolves.toBe(false);
    expect(stalledPlayer.play).not.toHaveBeenCalled();
  });

  it('does not start a stale cue after its player family is released', async () => {
    let finishSeek: () => void = () => undefined;
    const stalePlayer = audioPlayer();
    stalePlayer.seekTo.mockImplementation(
      () => new Promise<undefined>((resolve) => {
        finishSeek = () => resolve(undefined);
      }),
    );
    const players = [
      stalePlayer,
      audioPlayer(),
      audioPlayer(),
      audioPlayer(),
      audioPlayer(),
      audioPlayer(),
      audioPlayer(),
      audioPlayer(),
    ];
    mockedCreateAudioPlayer.mockImplementation(() => players.shift() as never);
    const cues = new CueSoundPlayer();
    cues.prepare('chime');

    const started = cues.play('next');
    cues.prepare('ping');
    finishSeek();

    await expect(started).resolves.toBe(false);
    expect(stalePlayer.play).not.toHaveBeenCalled();
  });
});
