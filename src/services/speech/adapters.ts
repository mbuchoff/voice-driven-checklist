export type SpeechPlaybackAdapter = {
  isAvailable(): Promise<boolean>;
  /**
   * Begins spoken playback of `text`. The returned promise resolves when
   * playback finishes — either naturally or because `stop()` was called.
   * Rejects only when the underlying TTS subsystem fails outright.
   */
  speak(text: string, options: { locale: string }): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
};

export type RecognitionResult = {
  transcript: string;
  isFinal: boolean;
};

export type RecognitionListenOptions = {
  locale: string;
  onResult: (result: RecognitionResult) => void;
  onError: (error: string) => void;
};

export type SpeechRecognitionAdapter = {
  isAvailable(): Promise<boolean>;
  requestPermissionsIfNeeded(): Promise<'granted' | 'denied' | 'unavailable'>;
  /**
   * Begins a recognition session. Implementations must replace any previous
   * result/error listeners, and this may be called after a natural recognizer
   * end without an intervening `stopListening()`.
   */
  startListening(options: RecognitionListenOptions): Promise<void>;
  stopListening(): Promise<void>;
  dispose(): Promise<void>;
};
