import { requireOptionalNativeModule } from 'expo-modules-core';

import type { SpeechPlaybackAdapter } from './adapters';

type AndroidRoutedPlaybackModule = {
  isSpeechAvailable(): Promise<boolean>;
  speakRouted(text: string, locale: string): Promise<void>;
  stopRoutedSpeech(): Promise<void>;
};

const nativePlayback = requireOptionalNativeModule<Partial<AndroidRoutedPlaybackModule>>(
  'VoiceChecklistAudioRoute',
);

export const ANDROID_ROUTED_PLAYBACK_AVAILABILITY_TIMEOUT_MS = 10_000;

function getNativePlayback(): AndroidRoutedPlaybackModule | null {
  if (
    typeof nativePlayback?.isSpeechAvailable === 'function' &&
    typeof nativePlayback.speakRouted === 'function' &&
    typeof nativePlayback.stopRoutedSpeech === 'function'
  ) {
    return nativePlayback as AndroidRoutedPlaybackModule;
  }

  return null;
}

export function isAndroidRoutedPlaybackAvailable(): boolean {
  return getNativePlayback() !== null;
}

export class AndroidRoutedPlaybackAdapter implements SpeechPlaybackAdapter {
  async isAvailable(): Promise<boolean> {
    const playback = getNativePlayback();
    if (!playback) return false;

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        playback.isSpeechAvailable(),
        new Promise<false>((resolve) => {
          timeoutHandle = setTimeout(
            () => resolve(false),
            ANDROID_ROUTED_PLAYBACK_AVAILABILITY_TIMEOUT_MS,
          );
        }),
      ]);
    } catch {
      return false;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  async speak(text: string, options: { locale: string }): Promise<void> {
    const playback = getNativePlayback();
    if (!playback) {
      throw new Error('Android routed playback is unavailable.');
    }

    await playback.speakRouted(text, options.locale);
  }

  async stop(): Promise<void> {
    const playback = getNativePlayback();
    if (!playback) return;
    await playback.stopRoutedSpeech();
  }

  async dispose(): Promise<void> {
    await this.stop();
  }
}
