import { resolveCognitoClientConfig } from './config';

const PUBLIC_CONFIG = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_example',
  domain: 'https://voice-checklist-dev.auth.us-east-1.amazoncognito.com',
  androidClientId: 'android-public-client',
  webClientId: 'web-public-client',
};

describe('Cognito public configuration', () => {
  it('selects the Android app client for Android builds', () => {
    expect(
      resolveCognitoClientConfig(
        PUBLIC_CONFIG,
        'android',
        'voicechecklist://auth/callback',
      ),
    ).toEqual({
      region: 'us-east-1',
      userPoolId: 'us-east-1_example',
      domain: 'https://voice-checklist-dev.auth.us-east-1.amazoncognito.com',
      clientId: 'android-public-client',
      redirectUri: 'voicechecklist://auth/callback',
    });
  });

  it('selects the web app client for the current web origin', () => {
    expect(
      resolveCognitoClientConfig(
        PUBLIC_CONFIG,
        'web',
        'http://localhost:8082/auth/callback',
      ),
    ).toMatchObject({
      clientId: 'web-public-client',
      redirectUri: 'http://localhost:8082/auth/callback',
    });
  });

  it('leaves Google sign-in unavailable when required public values are missing', () => {
    expect(
      resolveCognitoClientConfig(
        { ...PUBLIC_CONFIG, androidClientId: '' },
        'android',
        'voicechecklist://auth/callback',
      ),
    ).toBeNull();
  });

  it('does not select an Android client for deferred iOS builds', () => {
    expect(
      resolveCognitoClientConfig(
        PUBLIC_CONFIG,
        'ios',
        'voicechecklist://auth/callback',
      ),
    ).toBeNull();
  });
});
