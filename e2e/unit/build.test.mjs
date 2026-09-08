import assert from 'node:assert/strict';
import { test } from 'node:test';

import { androidBuildPlan } from '../support/build.mjs';

test('the Gradle plan targets arm64 release with the daemon disabled', () => {
  const projectRoot = '/workspace/voice-checklist';

  assert.deepEqual(androidBuildPlan(projectRoot), {
    gradle: '/workspace/voice-checklist/android/gradlew',
    cwd: '/workspace/voice-checklist/android',
    args: [
      'assembleRelease',
      '--no-daemon',
      '-PreactNativeArchitectures=arm64-v8a',
    ],
    apk: '/workspace/voice-checklist/android/app/build/outputs/apk/release/app-release.apk',
  });
});
