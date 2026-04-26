const { withAndroidManifest, withProjectBuildGradle } = require('expo/config-plugins');

const NOTIFEE_FOREGROUND_SERVICE = 'app.notifee.core.ForegroundService';
const NOTIFEE_MAVEN_REPO =
  'maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }';

function appendToolsReplace(currentValue) {
  const values = new Set(
    String(currentValue ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  values.add('android:foregroundServiceType');
  return Array.from(values).join(',');
}

function withNotifeeForegroundServiceManifest(config) {
  return withAndroidManifest(config, (manifestConfig) => {
    const manifest = manifestConfig.modResults.manifest;
    manifest.$ = manifest.$ ?? {};
    manifest.$['xmlns:tools'] =
      manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';

    const application = manifest.application?.[0];
    if (!application) return manifestConfig;

    application.service = application.service ?? [];
    let service = application.service.find(
      (entry) => entry.$?.['android:name'] === NOTIFEE_FOREGROUND_SERVICE,
    );

    if (!service) {
      service = { $: { 'android:name': NOTIFEE_FOREGROUND_SERVICE } };
      application.service.push(service);
    }

    service.$ = service.$ ?? {};
    service.$['android:exported'] = 'false';
    service.$['android:foregroundServiceType'] = 'microphone';
    service.$['tools:replace'] = appendToolsReplace(service.$['tools:replace']);

    return manifestConfig;
  });
}

function withNotifeeCoreMavenRepo(config) {
  return withProjectBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') return gradleConfig;
    if (gradleConfig.modResults.contents.includes('@notifee/react-native/android/libs')) {
      return gradleConfig;
    }

    gradleConfig.modResults.contents = gradleConfig.modResults.contents.replace(
      /(allprojects\s*\{\s*repositories\s*\{)/,
      `$1\n    ${NOTIFEE_MAVEN_REPO}`,
    );
    return gradleConfig;
  });
}

module.exports = function withNotifeeMicrophoneForegroundService(config) {
  return withNotifeeCoreMavenRepo(withNotifeeForegroundServiceManifest(config));
};
