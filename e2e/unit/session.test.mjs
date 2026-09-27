import assert from 'node:assert/strict';
import { test } from 'node:test';

import { androidSessionCapabilities } from '../support/session.mjs';

test('a run installs the supplied candidate even when the phone already has the same app version', () => {
  assert.equal(
    androidSessionCapabilities('/workspace/voice-checklist.apk')[
      'appium:enforceAppInstall'
    ],
    true,
  );
});

for (const socket of ['tcp:127.0.0.1:5038', 'tcp:localhost:5038', 'tcp:5038']) {
  test(`Appium uses the same local ADB endpoint as direct commands for ${socket}`, () => {
    const capabilities = androidSessionCapabilities('/candidate.apk', socket);
    assert.equal(capabilities['appium:adbPort'], 5038);
    assert.equal(capabilities['appium:remoteAdbHost'], socket.includes('127.0.0.1') ? '127.0.0.1' : 'localhost');
  });
}

for (const socket of ['tcp:host.docker.internal:5037', 'localfilesystem:/tmp/adb.sock',
  'tcp:127.0.0.1:0', 'tcp:127.0.0.1:65536', 'tcp:127.0.0.1:invalid']) {
  test(`rejects unsupported ADB routing instead of silently using another server: ${socket}`, () => {
    assert.throws(() => androidSessionCapabilities('/candidate.apk', socket), /local TCP ADB server/);
  });
}
