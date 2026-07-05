const packageJson = require('../package.json');

describe('package entrypoint', () => {
  it('uses the public Expo Router entry without a direct Metro runtime dependency', () => {
    expect(packageJson.main).toBe('expo-router/entry');
    expect(packageJson.dependencies).not.toHaveProperty('@expo/metro-runtime');
  });
});
