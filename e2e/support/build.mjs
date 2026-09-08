import { resolve } from 'node:path';

export function androidBuildPlan(projectRoot) {
  return {
    gradle: resolve(projectRoot, 'android/gradlew'),
    cwd: resolve(projectRoot, 'android'),
    args: [
      'assembleRelease',
      '--no-daemon',
      '-PreactNativeArchitectures=arm64-v8a',
    ],
    apk: resolve(
      projectRoot,
      'android/app/build/outputs/apk/release/app-release.apk',
    ),
  };
}
