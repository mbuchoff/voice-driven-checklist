const { describe, expect, it } = require('@jest/globals');

const FIXTURE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
            def enablePngCrunchInRelease = findProperty('android.enablePngCrunchInReleaseBuilds') ?: 'true'
            crunchPngs enablePngCrunchInRelease.toBoolean()
        }
    }
}`;

const RELEASE_SIGNING_CONFIG = `release {
            if (project.hasProperty('VOICE_CHECKLIST_UPLOAD_STORE_FILE')) {
                storeFile file(VOICE_CHECKLIST_UPLOAD_STORE_FILE)
                storePassword VOICE_CHECKLIST_UPLOAD_STORE_PASSWORD
                keyAlias VOICE_CHECKLIST_UPLOAD_KEY_ALIAS
                keyPassword VOICE_CHECKLIST_UPLOAD_KEY_PASSWORD
            }
        }`;

describe('release signing config transform', () => {
  const { transformReleaseSigningConfig } = require('./withReleaseSigningConfig');

  it('configures release signing without changing debug signing', () => {
    const result = transformReleaseSigningConfig(FIXTURE);

    expect(result).toContain(RELEASE_SIGNING_CONFIG);
    expect(result).toMatch(
      /debug\s*\{\s*signingConfig signingConfigs\.debug\s*\}/,
    );
    expect(result).toMatch(
      /release\s*\{[\s\S]*?reactnative\.dev\/docs\/signed-apk-android\.[\s\S]*?signingConfig project\.hasProperty\('VOICE_CHECKLIST_E2E'\) \? signingConfigs\.debug : signingConfigs\.release/,
    );
  });

  it('is idempotent', () => {
    const once = transformReleaseSigningConfig(FIXTURE);

    expect(transformReleaseSigningConfig(once)).toBe(once);
  });

  it('throws when the signing config anchor is missing', () => {
    expect(() => transformReleaseSigningConfig('android { buildTypes {} }')).toThrow(
      'Could not add the release signing config to android/app/build.gradle.',
    );
  });

  it('throws when the release build type anchor is missing', () => {
    const withoutReleaseBuildType = FIXTURE.replace(
      /\s*\/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.[\s\S]*?(?=\s*def enableShrinkResources)/,
      '\n',
    );

    expect(() => transformReleaseSigningConfig(withoutReleaseBuildType)).toThrow(
      'Could not configure release signing in android/app/build.gradle.',
    );
  });
});
