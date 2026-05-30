import { NativeModules, Platform } from 'react-native';

type AndroidBluetoothAudioRouteModule = {
  start(): Promise<boolean>;
  stop(): Promise<void>;
};

const nativeRoute = NativeModules.VoiceChecklistAudioRoute as
  | AndroidBluetoothAudioRouteModule
  | undefined;

export async function startAndroidBluetoothAudioRoute(): Promise<void> {
  if (Platform.OS !== 'android' || !nativeRoute) return;

  try {
    await nativeRoute.start();
  } catch {
    // Best-effort: voice control stays usable on the built-in mic if routing fails.
    // The native module logs the outcome under the "VoiceChecklistAudioRoute" tag.
  }
}

export async function stopAndroidBluetoothAudioRoute(): Promise<void> {
  if (Platform.OS !== 'android' || !nativeRoute) return;

  try {
    await nativeRoute.stop();
  } catch {
    // Best-effort; cleanup may race with process or audio-service teardown.
  }
}
