import {
  startAndroidBluetoothAudioRoute,
  stopAndroidBluetoothAudioRoute,
} from './androidBluetoothAudioRoute';
import {
  startListeningNotification,
  stopListeningNotification,
} from './foregroundService';

export async function startVoiceRunSession(checklistTitle: string): Promise<void> {
  await startListeningNotification(checklistTitle);
  await startAndroidBluetoothAudioRoute();
}

export async function stopVoiceRunSession(): Promise<void> {
  await Promise.allSettled([
    stopAndroidBluetoothAudioRoute(),
    stopListeningNotification(),
  ]);
}
