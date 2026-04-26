import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type { EventSubscription } from 'expo-modules-core';
import { Platform } from 'react-native';

import type {
  RecognitionListenOptions,
  SpeechRecognitionAdapter,
} from './adapters';

export class ExpoRecognitionAdapter implements SpeechRecognitionAdapter {
  private subscriptions: EventSubscription[] = [];

  async isAvailable(): Promise<boolean> {
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      return false;
    }
  }

  async requestPermissionsIfNeeded(): Promise<'granted' | 'denied' | 'unavailable'> {
    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      return result.granted ? 'granted' : 'denied';
    } catch {
      return 'unavailable';
    }
  }

  async startListening(options: RecognitionListenOptions): Promise<void> {
    this.clearSubscriptions();

    this.subscriptions.push(
      ExpoSpeechRecognitionModule.addListener('result', (event) => {
        const first = event.results[0];
        if (!first) return;
        options.onResult({ transcript: first.transcript, isFinal: event.isFinal });
      }),
      ExpoSpeechRecognitionModule.addListener('nomatch', () => {
        options.onError('no-match');
      }),
      ExpoSpeechRecognitionModule.addListener('error', (event) => {
        options.onError(event.error);
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        options.onError('aborted');
      }),
    );

    ExpoSpeechRecognitionModule.start({
      lang: options.locale,
      continuous: supportsSegmentedContinuousRecognition(),
      interimResults: false,
      maxAlternatives: 1,
      contextualStrings: ['next', 'repeat', 'previous'],
      androidIntentOptions: {
        EXTRA_LANGUAGE_MODEL: 'web_search',
      },
      iosTaskHint: 'confirmation',
      iosCategory: {
        category: 'playAndRecord',
        categoryOptions: ['mixWithOthers', 'defaultToSpeaker', 'allowBluetooth'],
        mode: 'spokenAudio',
      },
    });
  }

  async stopListening(): Promise<void> {
    this.clearSubscriptions();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // Stop can emit `end` synchronously or throw when no native session remains.
    }
  }

  async dispose(): Promise<void> {
    await this.stopListening();
  }

  private clearSubscriptions() {
    for (const sub of this.subscriptions) sub.remove();
    this.subscriptions = [];
  }
}

function supportsSegmentedContinuousRecognition(): boolean {
  return Platform.OS === 'android' && Number(Platform.Version) >= 33;
}
