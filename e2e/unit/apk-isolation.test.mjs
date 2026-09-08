import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { assertIsolatedApk } from '../support/android.mjs';

test('accepts the exact isolated identity returned by the APK metadata tool', (t) => {
  const previous = process.env.ANDROID_HOME;
  process.env.ANDROID_HOME = '/test-sdk';
  t.after(() => {
    if (previous === undefined) delete process.env.ANDROID_HOME;
    else process.env.ANDROID_HOME = previous;
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  t.mock.method(childProcess, 'execFileSync', (_file, args) => {
    assert.deepEqual(args, ['manifest', 'application-id', '/test/candidate.apk']);
    return 'com.mbuchoff.voicechecklist.e2e\n';
  });
  syncBuiltinESMExports();
  assert.doesNotThrow(() => assertIsolatedApk('/test/candidate.apk'));
});

for (const [name, readManifest] of [
  ['a normal-app APK', () => 'com.mbuchoff.voicechecklist\n'],
  ['an unreadable APK', () => { throw new Error('Invalid binary manifest'); }],
  ['an APK without a package identity', () => '\n'],
]) {
  test(`rejects ${name} before starting Appium`, async (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'voice-checklist-apk-guard-'));
    const apk = join(directory, 'candidate.apk');
    writeFileSync(apk, 'metadata tool boundary is mocked in this test');
    const environment = {
      E2E_APK: apk,
      E2E_ARTIFACT_DIR: join(directory, 'artifacts'),
      ANDROID_HOME: '/test-sdk',
    };
    const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
    Object.assign(process.env, environment);
    t.after(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      t.mock.restoreAll();
      syncBuiltinESMExports();
      rmSync(directory, { recursive: true, force: true });
    });
    t.mock.method(childProcess, 'execFileSync', readManifest);
    const spawn = t.mock.method(childProcess, 'spawn', () => {
      throw new Error('Appium must not start for an unverified APK');
    });
    syncBuiltinESMExports();

    await assert.rejects(import(`../scripts/run-android.mjs?case=${encodeURIComponent(name)}`),
      /Refusing APK|Could not verify APK/);
    assert.equal(spawn.mock.callCount(), 0);
  });
}
