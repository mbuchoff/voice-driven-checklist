const { afterEach, describe, expect, it } = require('@jest/globals');

const resolveConfig = require('./app.config');
const staticConfig = require('./app.json');

describe('app config', () => {
  afterEach(() => {
    delete process.env.ANDROID_VERSION_CODE;
    delete process.env.EXPO_PUBLIC_COGNITO_REGION;
    delete process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID;
    delete process.env.EXPO_PUBLIC_COGNITO_DOMAIN;
    delete process.env.EXPO_PUBLIC_COGNITO_ANDROID_CLIENT_ID;
    delete process.env.EXPO_PUBLIC_COGNITO_WEB_CLIENT_ID;
    delete process.env.VOICE_CHECKLIST_E2E;
  });

  it('uses the Android version code from the environment', () => {
    process.env.ANDROID_VERSION_CODE = '42';

    const config = resolveConfig({ config: { android: {} } });

    expect(config.android.versionCode).toBe(42);
  });

  it('resizes the Android viewport when the keyboard opens', () => {
    expect(staticConfig.expo.android.softwareKeyboardLayoutMode).toBe(
      'resize',
    );
  });

  it('falls back to version code 1 and preserves unrelated config', () => {
    const baseConfig = {
      name: 'Voice Checklist',
      android: { package: 'com.mbuchoff.voicechecklist' },
    };

    const config = resolveConfig({ config: baseConfig });

    expect(config).toEqual({
      name: 'Voice Checklist',
      android: {
        package: 'com.mbuchoff.voicechecklist',
        versionCode: 1,
      },
      extra: {
        cognito: {
          region: null,
          userPoolId: null,
          domain: null,
          androidClientId: null,
          webClientId: null,
        },
      },
    });
  });

  it('publishes Cognito endpoints and public client IDs from the build environment', () => {
    process.env.EXPO_PUBLIC_COGNITO_REGION = 'us-east-1';
    process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID = 'us-east-1_example';
    process.env.EXPO_PUBLIC_COGNITO_DOMAIN =
      'https://voice-checklist.auth.us-east-1.amazoncognito.com';
    process.env.EXPO_PUBLIC_COGNITO_ANDROID_CLIENT_ID = 'android-client';
    process.env.EXPO_PUBLIC_COGNITO_WEB_CLIENT_ID = 'web-client';

    const config = resolveConfig({
      config: { extra: { existing: 'preserved' } },
    });

    expect(config.extra).toEqual({
      existing: 'preserved',
      cognito: {
        region: 'us-east-1',
        userPoolId: 'us-east-1_example',
        domain: 'https://voice-checklist.auth.us-east-1.amazoncognito.com',
        androidClientId: 'android-client',
        webClientId: 'web-client',
      },
    });
  });

  it('gives the E2E build an isolated Android identity', () => {
    process.env.VOICE_CHECKLIST_E2E = '1';

    const config = resolveConfig({
      config: {
        name: 'Voice Checklist',
        scheme: 'voicechecklist',
        android: { package: 'com.mbuchoff.voicechecklist' },
      },
    });

    expect(config).toMatchObject({
      name: 'Voice Checklist E2E',
      scheme: 'voicechecklist-e2e',
      android: { package: 'com.mbuchoff.voicechecklist.e2e' },
    });
  });
});
