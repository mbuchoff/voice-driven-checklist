import { requireOptionalNativeModule } from 'expo-modules-core';

type CountdownWakeLockModule = {
  acquireCountdownWakeLock(timeoutMs: number): void;
  releaseCountdownWakeLock(): void;
};

const native = requireOptionalNativeModule<Partial<CountdownWakeLockModule>>(
  'VoiceChecklistAudioRoute',
);

/**
 * Keeps the processor awake for up to `timeoutMs` so a countdown finishes on
 * time with the screen off. A no-op where the native module isn't available.
 */
export function acquireCountdownWakeLock(timeoutMs: number): void {
  native?.acquireCountdownWakeLock?.(timeoutMs);
}

export function releaseCountdownWakeLock(): void {
  native?.releaseCountdownWakeLock?.();
}
