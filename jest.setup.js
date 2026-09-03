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

// The Reanimated 4 Jest mock does not expose the UI-frame hook. Frame-driven
// behavior is covered through its pure calculations and connected-device E2E.
Reanimated.useFrameCallback = () => undefined;
