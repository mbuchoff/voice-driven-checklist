import * as Speech from 'expo-speech';

import type { SpeechPlaybackAdapter } from './adapters';

export class ExpoPlaybackAdapter implements SpeechPlaybackAdapter {
  async isAvailable(): Promise<boolean> {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      return voices.length > 0;
    } catch {
      return false;
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
