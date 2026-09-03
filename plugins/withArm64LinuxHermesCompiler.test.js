const { describe, expect, it } = require('@jest/globals');

const FIXTURE = `react {
    hermesCommand = new File(["node", "--print", "require.resolve('hermes-compiler/package.json')"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/hermesc/%OS-BIN%/hermesc"
}`;

describe('ARM64 Linux Hermes compiler transform', () => {
  const {
    transformArm64LinuxHermesCompiler,
  } = require('./withArm64LinuxHermesCompiler');

  it('selects the packaged Linux compiler without Gradle OS detection', () => {
    const result = transformArm64LinuxHermesCompiler(FIXTURE);

    expect(result).toContain('/hermesc/linux64-bin/hermesc');
    expect(result).not.toContain('%OS-BIN%');
  });

  it('is idempotent', () => {
    const once = transformArm64LinuxHermesCompiler(FIXTURE);

    expect(transformArm64LinuxHermesCompiler(once)).toBe(once);
  });

  it('throws when the generated Hermes command is missing', () => {
    expect(() => transformArm64LinuxHermesCompiler('react {}')).toThrow(
      'Could not configure the Hermes compiler for ARM64 Linux.',
    );
  });

  it('is registered in the Expo app configuration', () => {
    const appConfig = require('../app.json');

    expect(appConfig.expo.plugins).toContain(
      './plugins/withArm64LinuxHermesCompiler',
    );
  });
});
