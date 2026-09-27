const { withAppBuildGradle } = require('expo/config-plugins');

const GENERATED_HERMES_COMMAND = '/hermesc/%OS-BIN%/hermesc';
const LINUX_HERMES_COMMAND = '/hermesc/linux64-bin/hermesc';

function transformArm64LinuxHermesCompiler(contents) {
  if (contents.includes(LINUX_HERMES_COMMAND)) return contents;

  if (!contents.includes(GENERATED_HERMES_COMMAND)) {
    throw new Error(
      'Could not configure the Hermes compiler for ARM64 Linux.',
    );
  }

  return contents.replace(GENERATED_HERMES_COMMAND, LINUX_HERMES_COMMAND);
}

function withArm64LinuxHermesCompiler(config) {
  if (process.platform !== 'linux' || process.arch !== 'arm64') return config;

  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') return gradleConfig;

    gradleConfig.modResults.contents = transformArm64LinuxHermesCompiler(
      gradleConfig.modResults.contents,
    );
    return gradleConfig;
  });
}

module.exports = withArm64LinuxHermesCompiler;
module.exports.transformArm64LinuxHermesCompiler =
  transformArm64LinuxHermesCompiler;
