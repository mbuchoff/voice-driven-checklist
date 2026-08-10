const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { describe, expect, it } = require('@jest/globals');

const script = path.join(
  process.cwd(),
  'scripts',
  'verify-production-cognito-config.sh',
);
const requiredVariables = [
  'EXPO_PUBLIC_COGNITO_REGION',
  'EXPO_PUBLIC_COGNITO_USER_POOL_ID',
  'EXPO_PUBLIC_COGNITO_DOMAIN',
  'EXPO_PUBLIC_COGNITO_ANDROID_CLIENT_ID',
];

function runPreflight(configuration = {}) {
  const env = { ...process.env };
  for (const variableName of requiredVariables) delete env[variableName];
  Object.assign(env, configuration);
  return spawnSync('bash', [script], { encoding: 'utf8', env });
}

describe('production Cognito configuration preflight', () => {
  it('blocks release preparation and identifies every missing setting', () => {
    const result = runPreflight();

    expect(result.status).toBe(1);
    for (const variableName of requiredVariables) {
      expect(result.stderr).toContain(variableName);
    }
  });

  it('allows release preparation when every setting is present', () => {
    const result = runPreflight({
      EXPO_PUBLIC_COGNITO_REGION: 'us-east-1',
      EXPO_PUBLIC_COGNITO_USER_POOL_ID: 'us-east-1_example',
      EXPO_PUBLIC_COGNITO_DOMAIN:
        'https://voice-checklist.example.auth.us-east-1.amazoncognito.com',
      EXPO_PUBLIC_COGNITO_ANDROID_CLIENT_ID: 'android-client',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });
});
