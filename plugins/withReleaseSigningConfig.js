const { withAppBuildGradle } = require('expo/config-plugins');

const SIGNING_CONFIGS_ANCHOR =
  /(^[ \t]*keyPassword[ \t]+'android'[ \t]*\r?\n)(^[ \t]*}[ \t]*\r?\n)(^[ \t]*})([ \t]*\r?\n^[ \t]*buildTypes[ \t]*\{)/m;
const RELEASE_BUILD_TYPE_ANCHOR =
  /(\/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.[ \t]*\r?\n[ \t]*)signingConfig[ \t]+signingConfigs\.debug/;

function transformReleaseSigningConfig(contents) {
  if (contents.includes('signingConfigs.release')) return contents;

  if (!SIGNING_CONFIGS_ANCHOR.test(contents)) {
    throw new Error(
      'Could not add the release signing config to android/app/build.gradle.',
    );
  }

  const withReleaseSigningConfig = contents.replace(
    SIGNING_CONFIGS_ANCHOR,
    `$1$2        release {
            if (project.hasProperty('VOICE_CHECKLIST_UPLOAD_STORE_FILE')) {
                storeFile file(VOICE_CHECKLIST_UPLOAD_STORE_FILE)
                storePassword VOICE_CHECKLIST_UPLOAD_STORE_PASSWORD
                keyAlias VOICE_CHECKLIST_UPLOAD_KEY_ALIAS
                keyPassword VOICE_CHECKLIST_UPLOAD_KEY_PASSWORD
            }
        }
$3$4`,
  );

  if (!RELEASE_BUILD_TYPE_ANCHOR.test(withReleaseSigningConfig)) {
    throw new Error('Could not configure release signing in android/app/build.gradle.');
  }

  return withReleaseSigningConfig.replace(
    RELEASE_BUILD_TYPE_ANCHOR,
    '$1signingConfig signingConfigs.release',
  );
}

function withReleaseSigningConfig(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') return gradleConfig;

    gradleConfig.modResults.contents = transformReleaseSigningConfig(
      gradleConfig.modResults.contents,
    );
    return gradleConfig;
  });
}

module.exports = withReleaseSigningConfig;
module.exports.transformReleaseSigningConfig = transformReleaseSigningConfig;
