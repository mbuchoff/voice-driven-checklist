import { nativePower } from './nativePower';

/**
 * Keeps the processor awake for up to `timeoutMs` so a countdown finishes on
 * time with the screen off (Android only).
 */
export function acquireCountdownWakeLock(timeoutMs: number): void {
  nativePower()?.acquireCountdownWakeLock(timeoutMs);
}

export function releaseCountdownWakeLock(): void {
  nativePower()?.releaseCountdownWakeLock();
}
