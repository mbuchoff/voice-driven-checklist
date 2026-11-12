import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type PowerModule = {
  acquireCountdownWakeLock(timeoutMs: number): void;
  releaseCountdownWakeLock(): void;
  elapsedRealtimeMillis(): number;
};

let power: PowerModule | null | undefined;

/**
 * The app's Android power module (`modules/voice-checklist-power`). Required
 * on Android, so a build without it fails loudly instead of quietly losing
 * the wake lock or the sleep-proof clock; there's none elsewhere.
 */
export function nativePower(): PowerModule | null {
  if (power === undefined) {
    power = Platform.OS === 'android' ? requireNativeModule<PowerModule>('VoiceChecklistPower') : null;
  }
  return power;
}
