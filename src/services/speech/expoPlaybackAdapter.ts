import * as Speech from 'expo-speech';

import type { SpeechPlaybackAdapter } from './adapters';

// On Android, when no TTS engine is installed/enabled,
// Speech.getAvailableVoicesAsync() never resolves (verified on Pixel 7
// 2026-04-19 by disabling com.google.android.tts). Without this cap the
// run route's loading spinner shows forever instead of falling back to
// the playback-unavailable banner.
const AVAILABILITY_TIMEOUT_MS = 3000;

export class ExpoPlaybackAdapter implements SpeechPlaybackAdapter {
  async isAvailable(): Promise<boolean> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const voices = await Promise.race([
        Speech.getAvailableVoicesAsync(),
        new Promise<null>((resolve) => {
          timeoutHandle = setTimeout(() => resolve(null), AVAILABILITY_TIMEOUT_MS);
        }),
      ]);
      return voices !== null && voices.length > 0;
    } catch {
      return false;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  speak(text: string, options: { locale: string }): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      Speech.speak(text, {
        language: options.locale,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: (error) => reject(error),
      });
    });
  }

  async stop(): Promise<void> {
    await Speech.stop();
  }

  async dispose(): Promise<void> {
    await Speech.stop();
  }
}
