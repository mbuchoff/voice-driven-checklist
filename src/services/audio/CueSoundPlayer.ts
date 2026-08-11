import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import type { SoundPreference } from '@/src/features/settings/preferences';

import { CUE_ACTIONS, type CueAction } from './cues';
export { CUE_ACTIONS, SOUND_OPTIONS, type CueAction } from './cues';

const CUE_START_TIMEOUT_MS = 300;

const SOURCES: Record<Exclude<SoundPreference, 'quiet'>, Record<CueAction, number>> = {
  chime: {
    next: require('../../../assets/audio/cues/chime-next.wav'),
    previous: require('../../../assets/audio/cues/chime-previous.wav'),
    repeat: require('../../../assets/audio/cues/chime-repeat.wav'),
    complete: require('../../../assets/audio/cues/chime-complete.wav'),
  },
  wood: {
    next: require('../../../assets/audio/cues/wood-next.wav'),
    previous: require('../../../assets/audio/cues/wood-previous.wav'),
    repeat: require('../../../assets/audio/cues/wood-repeat.wav'),
    complete: require('../../../assets/audio/cues/wood-complete.wav'),
  },
  ping: {
    next: require('../../../assets/audio/cues/ping-next.wav'),
    previous: require('../../../assets/audio/cues/ping-previous.wav'),
    repeat: require('../../../assets/audio/cues/ping-repeat.wav'),
    complete: require('../../../assets/audio/cues/ping-complete.wav'),
  },
};

export class CueSoundPlayer {
  private family: SoundPreference | null = null;
  private players = new Map<CueAction, AudioPlayer>();
  private playRequest = 0;

  prepare(family: SoundPreference): void {
    if (this.family === family) return;
    this.release();
    if (family === 'quiet') {
      this.family = family;
      return;
    }

    const players = new Map<CueAction, AudioPlayer>();
    try {
      for (const action of CUE_ACTIONS) {
        players.set(action, createAudioPlayer(SOURCES[family][action]));
      }
      this.players = players;
      this.family = family;
    } catch {
      this.releasePlayers(players);
    }
  }

  async play(action: CueAction): Promise<boolean> {
    const player = this.players.get(action);
    if (!player) return false;
    const request = ++this.playRequest;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const ready = await Promise.race([
        Promise.resolve(player.seekTo(0)).then(() => true),
        new Promise<boolean>((resolve) => {
          timeout = setTimeout(() => resolve(false), CUE_START_TIMEOUT_MS);
        }),
      ]);
      if (
        !ready ||
        request !== this.playRequest ||
        this.players.get(action) !== player
      ) {
        return false;
      }
      player.play();
      return true;
    } catch {
      // A cue must never prevent navigation, speech, or completion.
      return false;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  release(): void {
    this.playRequest += 1;
    this.releasePlayers();
    this.family = null;
  }

  private releasePlayers(players = this.players): void {
    for (const player of players.values()) {
      try {
        player.release?.();
      } catch {
        // Releasing audio is best effort during navigation and app teardown.
      }
    }
    players.clear();
  }
}
