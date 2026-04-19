import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

const SOURCE = require('../../../assets/audio/completion.wav');

/**
 * Plays a short, bundled chime when a checklist run finishes. Failures are
 * swallowed so the completed UI still renders if audio playback breaks.
 */
export class CompletionSoundPlayer {
  private player: AudioPlayer | null = null;

  async play(): Promise<void> {
    try {
      if (!this.player) {
        this.player = createAudioPlayer(SOURCE);
      } else {
        await this.player.seekTo(0);
      }
      this.player.play();
    } catch {
      // Completion UI must still appear even if sound playback fails.
    }
  }

  release(): void {
    try {
      this.player?.release?.();
    } catch {
      // ignored
    }
    this.player = null;
  }
}
