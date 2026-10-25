import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import type { SoundPreference } from '@/src/features/settings/preferences';

import type { CueAction } from './cues';
export { CUE_ACTIONS, SOUND_OPTIONS, type CueAction } from './cues';

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

// A cue that never reports its end is freed after this long anyway.
const CUE_MAX_MS = 3000;

export class CueSoundPlayer {
  private family: SoundPreference | null = null;
  private sounding = new Set<AudioPlayer>();

  prepare(family: SoundPreference): void {
    if (this.family === family) return;
    this.stopSounding();
    this.family = family;
  }

  // Every cue gets a new player. A player prepared earlier keeps the audio
  // track it made then, and after the phone locks that track can be gone:
  // the first play after the lock then sounds like nothing at all.
  //
  // Each cue's result is logged as the player reports it (requested,
  // playing, finished, timed out or failed), so a silent cue shows up.
  async play(action: CueAction): Promise<boolean> {
    const family = this.family;
    if (!family || family === 'quiet') return false;
    this.stopSounding();
    let player: AudioPlayer | null = null;
    try {
      const created = createAudioPlayer(SOURCES[family][action]);
      player = created;
      this.sounding.add(created);
      let playing = false;
      created.addListener('playbackStatusUpdate', (status) => {
        if (status.playing && !playing) {
          playing = true;
          console.info(`[cue] ${action} playing`);
        }
        if (status.didJustFinish && this.sounding.has(created)) {
          console.info(`[cue] ${action} finished`);
          this.free(created);
        }
      });
      setTimeout(() => {
        if (!this.sounding.has(created)) return;
        console.warn(`[cue] ${action} timed out`);
        this.free(created);
      }, CUE_MAX_MS);
      created.play();
      console.info(`[cue] ${action} requested`);
      return true;
    } catch {
      // A cue must never prevent navigation, speech, or completion.
      console.warn(`[cue] ${action} failed`);
      if (player) this.free(player);
      return false;
    }
  }

  release(): void {
    this.stopSounding();
    this.family = null;
  }

  private stopSounding(): void {
    for (const player of [...this.sounding]) this.free(player);
  }

  private free(player: AudioPlayer): void {
    if (!this.sounding.delete(player)) return;
    try {
      player.release();
    } catch {
      // Releasing audio is best effort during navigation and app teardown.
    }
  }
}
