const { describe, expect, it } = require('@jest/globals');

const FIXTURE = `package com.example

import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}`;

describe('Android pointer events transform', () => {
  const {
    transformAndroidPointerEvents,
  } = require('./withAndroidPointerEvents');

  it('enables pointer events before React Native loads', () => {
    const result = transformAndroidPointerEvents(FIXTURE);

    expect(result).toContain(
      'import com.facebook.react.config.ReactFeatureFlags',
    );
    expect(result.indexOf('ReactFeatureFlags.dispatchPointerEvents = true'))
      .toBeLessThan(result.indexOf('loadReactNative(this)'));
  });

  it('is idempotent', () => {
    const once = transformAndroidPointerEvents(FIXTURE);

    expect(transformAndroidPointerEvents(once)).toBe(once);
  });

  it('throws when the React Native load anchor is missing', () => {
    expect(() => transformAndroidPointerEvents('class MainApplication'))
      .toThrow('Could not enable Android pointer events in MainApplication.kt.');
  });

  it('is registered in the Expo app configuration', () => {
    const appConfig = require('../app.json');

    expect(appConfig.expo.plugins).toContain(
      './plugins/withAndroidPointerEvents',
    );
  });
});
