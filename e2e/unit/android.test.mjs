import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { test } from 'node:test';

import {
  collapseSystemPanelsArguments,
  mediaScanArguments,
  restoreDevicePresentation,
} from '../support/android.mjs';

test('restores an absent font-scale setting by deleting it, not writing the string null', (t) => {
  const previousHome = process.env.ANDROID_HOME;
  process.env.ANDROID_HOME = '/test-sdk';
  t.after(() => {
    if (previousHome === undefined) delete process.env.ANDROID_HOME;
    else process.env.ANDROID_HOME = previousHome;
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const execute = t.mock.method(childProcess, 'execFileSync', () => '');
  syncBuiltinESMExports();
  restoreDevicePresentation({ fontScale: 'null', override: null });
  restoreDevicePresentation({ fontScale: '1.15', override: '720x1600' });
  assert.deepEqual(execute.mock.calls.map(({ arguments: args }) => args[1].slice(args[1].indexOf('shell'))), [
    ['shell', 'settings', 'delete', 'system', 'font_scale'],
    ['shell', 'wm', 'size', 'reset'],
    ['shell', 'settings', 'put', 'system', 'font_scale', '1.15'],
    ['shell', 'wm', 'size', '720x1600'],
  ]);
});

test('the system-panel command requests collapse', () => {
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
