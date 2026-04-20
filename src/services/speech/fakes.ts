import type {
  RecognitionListenOptions,
  RecognitionResult,
  SpeechPlaybackAdapter,
  SpeechRecognitionAdapter,
} from './adapters';

/**
 * In-memory fake of `SpeechPlaybackAdapter` used by component tests and the
 * deterministic web e2e mode. Tests drive playback completion by calling
 * `completePlayback()` or `failPlayback()`.
 */
export class FakeSpeechPlaybackAdapter implements SpeechPlaybackAdapter {
  spoken: string[] = [];
  stopCount = 0;
  available = true;

  private pending: { resolve: () => void; reject: (e: unknown) => void } | null = null;

  setAvailable(value: boolean) {
    this.available = value;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async speak(text: string): Promise<void> {
    this.spoken.push(text);
    return new Promise<void>((resolve, reject) => {
      this.pending = { resolve, reject };
    });
  }

  async stop(): Promise<void> {
    this.stopCount += 1;
    this.completePlayback();
  }

  async dispose(): Promise<void> {
    this.completePlayback();
  }

  /** Simulate the current speech finishing naturally. */
  completePlayback(): void {
    const p = this.pending;
    this.pending = null;
    p?.resolve();
  }

  /** Simulate the current speech failing. */
  failPlayback(error: unknown = new Error('playback failed')): void {
    const p = this.pending;
    this.pending = null;
    p?.reject(error);
  }
}

/**
 * In-memory fake of `SpeechRecognitionAdapter`. Tests inject results via
 * `emitResult(...)` and errors via `emitError(...)`.
 */
export class FakeSpeechRecognitionAdapter implements SpeechRecognitionAdapter {
  available = true;
  permissionResult: 'granted' | 'denied' | 'unavailable' = 'granted';
  startCount = 0;
  stopCount = 0;

  private listener: RecognitionListenOptions | null = null;

  setAvailable(value: boolean) {
    this.available = value;
  }

  setPermissionResult(value: 'granted' | 'denied' | 'unavailable') {
    this.permissionResult = value;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async requestPermissionsIfNeeded(): Promise<'granted' | 'denied' | 'unavailable'> {
    return this.permissionResult;
  }

  async startListening(options: RecognitionListenOptions): Promise<void> {
    this.listener = options;
    this.startCount += 1;
  }

  async stopListening(): Promise<void> {
    this.listener = null;
    this.stopCount += 1;
  }

  async dispose(): Promise<void> {
    this.listener = null;
  }

  isListening(): boolean {
    return this.listener !== null;
  }

  emitResult(result: RecognitionResult): void {
    this.listener?.onResult(result);
  }

  emitError(error: string): void {
    this.listener?.onError(error);
  }
}
