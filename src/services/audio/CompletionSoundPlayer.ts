import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

const SOURCE = require('../../../assets/audio/completion.wav');

/**
 * Plays a short, bundled chime when a checklist run finishes. Failures are
 * swallowed so the completed UI still renders if audio playback breaks.
 */
export class CompletionSoundPlayer {
  private player: AudioPlayer | null = null;

  // Pre-create so ExoPlayer reaches STATE_READY before completion. On a
  // locked screen the main looper throttles during FG-service teardown, and
  // an in-flight prepare() at completion time silently drops the chime.
  prepare(): void {
    if (this.player) return;
    try {
      this.player = createAudioPlayer(SOURCE);
    } catch {
      // Completion UI must still appear even if audio setup fails.
    }
  }

  async play(): Promise<void> {
    if (!this.player) return;
    try {
      await this.player.seekTo(0);
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
