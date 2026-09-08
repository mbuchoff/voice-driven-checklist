import assert from 'node:assert/strict';
import { test } from 'node:test';

import { androidSessionCapabilities } from '../support/session.mjs';

test('session capabilities request forced APK installation', () => {
  assert.equal(
    androidSessionCapabilities('/workspace/voice-checklist.apk')[
      'appium:enforceAppInstall'
    ],
    true,
  );
});
