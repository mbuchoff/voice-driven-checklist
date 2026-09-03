import assert from 'node:assert/strict';
import { test } from 'node:test';

import { androidSessionCapabilities } from '../support/session.mjs';

test('reinstalls the supplied isolated APK even when its version is unchanged', () => {
  assert.equal(
    androidSessionCapabilities('/workspace/voice-checklist.apk')[
      'appium:enforceAppInstall'
    ],
    true,
  );
});
