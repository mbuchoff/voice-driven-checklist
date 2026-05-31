import {
  startAndroidBluetoothAudioRoute,
  stopAndroidBluetoothAudioRoute,
} from './androidBluetoothAudioRoute';
import {
  startListeningNotification,
  stopListeningNotification,
} from './foregroundService';

export async function startVoiceRunSession(checklistTitle: string): Promise<void> {
  // Sequential, not concurrent: the microphone foreground service must be up
  // before the mic opens, and a failed notification (permission denied) must
  // skip routing rather than leave the audio mode changed.
  await startListeningNotification(checklistTitle);
  await startAndroidBluetoothAudioRoute();
}

export async function stopVoiceRunSession(): Promise<void> {
  // Both stops are independent and best-effort (they swallow their own errors),
  // so run them concurrently.
  await Promise.all([
    stopAndroidBluetoothAudioRoute(),
    stopListeningNotification(),
  ]);
}
