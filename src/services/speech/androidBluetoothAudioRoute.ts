import { requireOptionalNativeModule } from 'expo-modules-core';

type AndroidBluetoothAudioRouteModule = {
  start(): Promise<boolean>;
  stop(): Promise<void>;
};

// Android-only Expo module (modules/voice-checklist-audio-route). requireOptional
// returns null on iOS/web — or a build that doesn't include it — so callers no-op
// and recognition falls back to the built-in mic.
const nativeRoute = requireOptionalNativeModule<AndroidBluetoothAudioRouteModule>(
  'VoiceChecklistAudioRoute',
);

export async function startAndroidBluetoothAudioRoute(): Promise<void> {
  if (!nativeRoute) return;

  try {
    await nativeRoute.start();
  } catch {
    // Best-effort: voice control stays usable on the built-in mic if routing fails.
    // The native module logs the outcome under the "VoiceChecklistAudioRoute" tag.
  }
}

export async function stopAndroidBluetoothAudioRoute(): Promise<void> {
  if (!nativeRoute) return;

  try {
    await nativeRoute.stop();
  } catch {
    // Best-effort; cleanup may race with process or audio-service teardown.
  }
}
