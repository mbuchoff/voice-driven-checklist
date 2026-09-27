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
