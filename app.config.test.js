const { afterEach, describe, expect, it } = require('@jest/globals');

const resolveConfig = require('./app.config');

describe('app config', () => {
  afterEach(() => {
    delete process.env.ANDROID_VERSION_CODE;
  });

  it('uses the Android version code from the environment', () => {
    process.env.ANDROID_VERSION_CODE = '42';

    const config = resolveConfig({ config: { android: {} } });

    expect(config.android.versionCode).toBe(42);
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
    });
  });
});
