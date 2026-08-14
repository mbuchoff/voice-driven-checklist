const { withMainApplication } = require('expo/config-plugins');

const LOAD_REACT_NATIVE_IMPORT =
  'import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative';
const POINTER_EVENTS_IMPORT =
  'import com.facebook.react.config.ReactFeatureFlags';
const POINTER_EVENTS_ASSIGNMENT =
  'ReactFeatureFlags.dispatchPointerEvents = true';

function transformAndroidPointerEvents(contents) {
  if (contents.includes(POINTER_EVENTS_ASSIGNMENT)) return contents;

  const loadAnchor = /^([ \t]*)loadReactNative\(this\)[ \t]*$/m;
  if (!loadAnchor.test(contents)) {
    throw new Error(
      'Could not enable Android pointer events in MainApplication.kt.',
    );
  }

  let next = contents;
  if (!next.includes(POINTER_EVENTS_IMPORT)) {
    if (!next.includes(LOAD_REACT_NATIVE_IMPORT)) {
      throw new Error(
        'Could not enable Android pointer events in MainApplication.kt.',
      );
    }
    next = next.replace(
      LOAD_REACT_NATIVE_IMPORT,
      `${LOAD_REACT_NATIVE_IMPORT}\n${POINTER_EVENTS_IMPORT}`,
    );
  }

  // The stop control uses contact width and height to grow around the user's
  // thumb; React Native exposes those values only through pointer events.
  return next.replace(
    loadAnchor,
    `$1${POINTER_EVENTS_ASSIGNMENT}\n$1loadReactNative(this)`,
  );
}

function withAndroidPointerEvents(config) {
  return withMainApplication(config, (mainApplicationConfig) => {
    mainApplicationConfig.modResults.contents =
      transformAndroidPointerEvents(
        mainApplicationConfig.modResults.contents,
      );
    return mainApplicationConfig;
  });
}

module.exports = withAndroidPointerEvents;
module.exports.transformAndroidPointerEvents = transformAndroidPointerEvents;
