/* global jest */

jest.mock('react-native-worklets', () =>
  require('react-native-worklets/lib/module/mock')
);
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock')
);

const React = require('react');
const Reanimated = require('react-native-reanimated');

Reanimated.setUpTests();

// Reanimated's stock mock returns a new SharedValue on every render, unlike
// the native hook. Preserve identity so gesture tests exercise the same
// cross-render ownership rules as the Android runtime.
const makeSharedValue = Reanimated.useSharedValue;
Reanimated.useSharedValue = (initialValue) => {
  const sharedValue = React.useRef(null);
  if (sharedValue.current === null) {
    sharedValue.current = makeSharedValue(initialValue);
  }
  return sharedValue.current;
};

// The mock's Easing.bezierFn returns its first argument instead of an easing
// function; give back a function (straight-line progress), as the native one
// returns its curve.
Reanimated.Easing.bezierFn = () => (t) => t;

// The Reanimated 4 Jest mock does not expose the UI-frame hook. Frame-driven
// behavior is covered through its pure calculations and connected-device E2E.
Reanimated.useFrameCallback = (_callback, autostart = true) => {
  const controller = React.useRef(null);
  if (controller.current === null) {
    controller.current = {
      isActive: autostart,
      callbackId: -1,
      setActive(active) { this.isActive = active; },
    };
  }
  return controller.current;
};

// A stand-in for the app's Android power module (modules/voice-checklist-power),
// for tests that run as Android: no wake lock, and the test's own clock.
globalThis.expo.modules.VoiceChecklistPower = {
  acquireCountdownWakeLock: () => {},
  releaseCountdownWakeLock: () => {},
  elapsedRealtimeMillis: () => performance.now(),
};
