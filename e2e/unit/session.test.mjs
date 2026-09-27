import assert from 'node:assert/strict';
import { test } from 'node:test';

import { androidSessionCapabilities } from '../support/session.mjs';

test('a run installs the supplied candidate even when the phone already has the same app version', () => {
  assert.equal(
    androidSessionCapabilities('/workspace/voice-checklist.apk', {})[
      'appium:enforceAppInstall'
    ],
    true,
  );
});

for (const [socket, host] of [
  ['tcp:127.0.0.1:5038', '127.0.0.1'],
  ['tcp:localhost:5038', 'localhost'],
  ['tcp:5038', 'localhost'],
]) {
  test(`Appium uses the same local ADB endpoint as direct commands for ${socket}`, () => {
    const capabilities = androidSessionCapabilities('/candidate.apk', { ADB_SERVER_SOCKET: socket });
    assert.equal(capabilities['appium:adbPort'], 5038);
    assert.equal(capabilities['appium:remoteAdbHost'], host);
  });
}

for (const socket of ['tcp:host.docker.internal:5037', 'localfilesystem:/tmp/adb.sock',
  'tcp:127.0.0.1:0', 'tcp:127.0.0.1:65536', 'tcp:127.0.0.1:invalid']) {
  test(`rejects unsupported ADB routing instead of silently using another server: ${socket}`, () => {
    assert.throws(() => androidSessionCapabilities('/candidate.apk', { ADB_SERVER_SOCKET: socket }), /local TCP ADB server/);
  });
}

for (const [variable, value] of [['ANDROID_ADB_SERVER_PORT', '5038'], ['ANDROID_ADB_SERVER_ADDRESS', 'host.docker.internal']]) {
  test(`rejects inherited ${variable} rather than splitting the two ADB clients`, (t) => {
    const names = ['ADB_SERVER_SOCKET', 'ANDROID_ADB_SERVER_PORT', 'ANDROID_ADB_SERVER_ADDRESS'];
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
    for (const name of names) delete process.env[name];
    process.env[variable] = value;
    t.after(() => {
      for (const [name, original] of Object.entries(previous)) {
        if (original === undefined) delete process.env[name];
        else process.env[name] = original;
      }
    });
    assert.throws(() => androidSessionCapabilities('/candidate.apk'), /ANDROID_ADB_SERVER/);
  });
}
