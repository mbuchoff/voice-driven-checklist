import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  collapseSystemPanelsArguments,
  mediaScanArguments,
} from '../support/android.mjs';

test('collapses Android system panels before activating the app', () => {
  assert.deepEqual(collapseSystemPanelsArguments(), [
    'shell',
    'cmd',
    'statusbar',
    'collapse',
  ]);
});

test('asks Android to index a pushed document for the system picker', () => {
  assert.deepEqual(
    mediaScanArguments('/sdcard/Download/voice-checklist.json'),
    [
      'shell',
      'am',
      'broadcast',
      '-a',
      'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
      '-d',
      'file:///sdcard/Download/voice-checklist.json',
    ],
  );
});
