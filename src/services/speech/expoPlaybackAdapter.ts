import * as Speech from 'expo-speech';

import type { SpeechPlaybackAdapter } from './adapters';

// Cap how long we wait for the TTS engine to report its voices. Two forces set it:
//  - When no TTS engine is installed/enabled, Speech.getAvailableVoicesAsync()
//    never resolves on Android (verified on Pixel 7 2026-04-19 by disabling
//    com.google.android.tts); without a cap the run route's loading spinner shows
//    forever instead of falling back to the playback-unavailable banner.
//  - A cold engine (just after boot/idle) can take several seconds to enumerate
//    voices; too short a cap falsely reports playback unavailable on the first
//    checklist (it then works on retry once the engine is warm).
// 10s comfortably outlasts a cold start while still bounding the disabled case.
export const AVAILABILITY_TIMEOUT_MS = 10_000;

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
