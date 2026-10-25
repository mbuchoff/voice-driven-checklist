import { requireOptionalNativeModule } from 'expo-modules-core';

type ElapsedRealtimeModule = { elapsedRealtimeMillis(): number };

const native = requireOptionalNativeModule<Partial<ElapsedRealtimeModule>>(
  'VoiceChecklistAudioRoute',
);

/**
 * Milliseconds on Android's elapsed-realtime clock, which keeps counting
 * while the phone sleeps and ignores changes to the time of day. Where the
 * native module isn't available, a monotonic stand-in.
 */
export function elapsedRealtimeMs(): number {
  return native?.elapsedRealtimeMillis?.() ?? performance.now();
}
