/* global describe, it, expect */

const {
  addAudioRoutePackageToMainApplication,
  createAudioRouteModuleSource,
  createAudioRoutePackageSource,
} = require('./withVoiceChecklistAudioRoute');

describe('withVoiceChecklistAudioRoute', () => {
  it('registers the audio route package in MainApplication once', () => {
    const contents = `class MainApplication : Application(), ReactApplication {
  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }
    )
  }
}
`;

    const updated = addAudioRoutePackageToMainApplication(contents);

    expect(updated).toContain('add(VoiceChecklistAudioRoutePackage())');
    expect(addAudioRoutePackageToMainApplication(updated)).toBe(updated);
  });

  it('generates Kotlin sources in the configured app package', () => {
    const moduleSource = createAudioRouteModuleSource('com.example.app');
    const packageSource = createAudioRoutePackageSource('com.example.app');

    expect(moduleSource).toContain('package com.example.app');
    expect(moduleSource).toContain('setCommunicationDevice(bluetoothDevice)');
    expect(moduleSource).toContain('TYPE_BLE_HEADSET');
    expect(packageSource).toContain('package com.example.app');
    expect(packageSource).toContain('VoiceChecklistAudioRouteModule');
  });

  it('logs routing diagnostics under a single tag for on-device debugging', () => {
    const moduleSource = createAudioRouteModuleSource('com.example.app');

    // Single, greppable log tag.
    expect(moduleSource).toContain('import android.util.Log');
    expect(moduleSource).toContain('const val TAG = "VoiceChecklistAudioRoute"');

    // Entry: which platform path runs and the starting audio mode.
    expect(moduleSource).toContain('Log.i(TAG, "start sdkInt="');

    // The enumeration that answers "do the AirPods even show up?".
    expect(moduleSource).toContain('Log.i(TAG, "availableCommunicationDevices="');
    expect(moduleSource).toContain('no Bluetooth communication device found');
    expect(moduleSource).toContain('found Bluetooth device type=');

    // The crucial before/after of the route request.
    expect(moduleSource).toContain('setCommunicationDevice result=');

    // The boolean we hand back to JS.
    expect(moduleSource).toContain('start resolved routedToBluetooth=');

    // Failure is never swallowed silently.
    expect(moduleSource).toContain('Log.e(TAG, "start failed"');

    // Legacy (<31) SCO path stays observable too.
    expect(moduleSource).toContain('startBluetoothSco requested');
  });
});
