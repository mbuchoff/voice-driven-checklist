import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type { EventSubscription } from 'expo-modules-core';

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
      ExpoSpeechRecognitionModule.addListener('error', (event) => {
        options.onError(event.error);
      }),
    );

    ExpoSpeechRecognitionModule.start({
      lang: options.locale,
      continuous: false,
      interimResults: false,
      maxAlternatives: 1,
    });
  }

  async stopListening(): Promise<void> {
    try {
      ExpoSpeechRecognitionModule.stop();
    } finally {
      this.clearSubscriptions();
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
