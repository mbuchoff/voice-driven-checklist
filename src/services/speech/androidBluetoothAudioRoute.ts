import { NativeModules, Platform } from 'react-native';

type AndroidBluetoothAudioRouteModule = {
  start(): Promise<boolean>;
  stop(): Promise<void>;
};

const nativeRoute = NativeModules.VoiceChecklistAudioRoute as
  | AndroidBluetoothAudioRouteModule
  | undefined;

export async function startAndroidBluetoothAudioRoute(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (!nativeRoute) {
    if (__DEV__) {
      console.warn(
        '[VoiceChecklistAudioRoute] native module missing from this build; AirPods mic routing inactive',
      );
    }
    return false;
  }

  try {
    const routedToBluetooth = await nativeRoute.start();
    if (__DEV__) {
      console.log(
        `[VoiceChecklistAudioRoute] start -> routedToBluetooth=${routedToBluetooth}`,
      );
    }
    return routedToBluetooth;
  } catch (error) {
    if (__DEV__) {
      console.warn('[VoiceChecklistAudioRoute] start failed', error);
    }
    return false;
  }
}

export async function stopAndroidBluetoothAudioRoute(): Promise<void> {
  if (Platform.OS !== 'android' || !nativeRoute) return;

  try {
    await nativeRoute.stop();
  } catch {
    // Routing is best-effort. Voice control should remain usable if cleanup
    // races with process or audio-service teardown.
  }
}
