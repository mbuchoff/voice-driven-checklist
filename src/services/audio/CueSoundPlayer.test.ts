import { createAudioPlayer } from 'expo-audio';

import { CueSoundPlayer } from './CueSoundPlayer';

jest.mock('expo-audio', () => ({
  __esModule: true,
  createAudioPlayer: jest.fn(),
}));

const mockedCreateAudioPlayer = createAudioPlayer as jest.MockedFunction<
  typeof createAudioPlayer
>;

type StatusListener = (status: { didJustFinish: boolean }) => void;

function audioPlayer() {
  const listeners: StatusListener[] = [];
  return {
    play: jest.fn(),
    release: jest.fn(),
    addListener: jest.fn((_event: string, listener: StatusListener) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    }),
    finish: () => listeners.forEach((listener) => listener({ didJustFinish: true })),
  };
}

function createdPlayers() {
  return mockedCreateAudioPlayer.mock.results.map(
    (result) => result.value as ReturnType<typeof audioPlayer>,
  );
}

describe('CueSoundPlayer', () => {
  beforeEach(() => {
    mockedCreateAudioPlayer.mockReset();
    mockedCreateAudioPlayer.mockImplementation(() => audioPlayer() as never);
  });

  it('plays the requested cue from the chosen family', async () => {
    const cues = new CueSoundPlayer();
    cues.prepare('wood');

    await expect(cues.play('previous')).resolves.toBe(true);

    expect(mockedCreateAudioPlayer).toHaveBeenCalledWith(
      require('../../../assets/audio/cues/wood-previous.wav'),
    );
    expect(createdPlayers()[0].play).toHaveBeenCalledTimes(1);
  });

  it('plays every cue on a new player, so none is left over from before the phone locked', async () => {
    const cues = new CueSoundPlayer();
    cues.prepare('chime');

    await cues.play('next');
    await cues.play('next');

    const [first, second] = createdPlayers();
    expect(createdPlayers()).toHaveLength(2);
    expect(second).not.toBe(first);
    expect(second.play).toHaveBeenCalledTimes(1);
  });

  it('frees a cue’s player once it has finished', async () => {
    const cues = new CueSoundPlayer();
    cues.prepare('ping');

    await cues.play('repeat');
    const [player] = createdPlayers();
    expect(player.release).not.toHaveBeenCalled();
    player.finish();

    expect(player.release).toHaveBeenCalledTimes(1);
  });

  it('cuts off a cue that is still sounding when the next one starts', async () => {
    const cues = new CueSoundPlayer();
    cues.prepare('ping');

    await cues.play('next');
    await cues.play('previous');

    const [first, second] = createdPlayers();
    expect(first.release).toHaveBeenCalledTimes(1);
    expect(second.release).not.toHaveBeenCalled();
  });

  it('keeps Quiet silent and stops a cue that is sounding', async () => {
    const cues = new CueSoundPlayer();
    cues.prepare('ping');
    await cues.play('next');

    cues.prepare('quiet');
    await expect(cues.play('complete')).resolves.toBe(false);

    expect(createdPlayers()).toHaveLength(1);
    expect(createdPlayers()[0].release).toHaveBeenCalledTimes(1);
  });

  it('plays nothing once released', async () => {
    const cues = new CueSoundPlayer();
    cues.prepare('chime');
    await cues.play('next');

    cues.release();

    await expect(cues.play('next')).resolves.toBe(false);
    expect(createdPlayers()[0].release).toHaveBeenCalledTimes(1);
  });

  it('swallows audio failures so run controls remain usable', async () => {
    const cues = new CueSoundPlayer();
    cues.prepare('chime');
    mockedCreateAudioPlayer.mockImplementationOnce(() => {
      throw new Error('audio unavailable');
    });
    await expect(cues.play('next')).resolves.toBe(false);

    const failing = audioPlayer();
    failing.play.mockImplementation(() => {
      throw new Error('playback failed');
    });
    mockedCreateAudioPlayer.mockImplementationOnce(() => failing as never);
    await expect(cues.play('next')).resolves.toBe(false);
    expect(failing.release).toHaveBeenCalledTimes(1);
  });
});
