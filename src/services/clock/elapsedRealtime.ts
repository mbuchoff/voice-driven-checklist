import { nativePower } from '@/src/services/power/nativePower';

/**
 * Milliseconds on Android's elapsed-realtime clock, which keeps counting
 * while the phone sleeps and ignores changes to the time of day. Off
 * Android, a monotonic stand-in.
 */
export function elapsedRealtimeMs(): number {
  return nativePower()?.elapsedRealtimeMillis() ?? performance.now();
}
