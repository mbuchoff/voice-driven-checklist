import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { test } from 'node:test';

import {
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

test('still restores the viewport and reports failure when restoring the font setting fails', (t) => {
  const previousHome = process.env.ANDROID_HOME;
  process.env.ANDROID_HOME = '/test-sdk';
  t.after(() => {
    if (previousHome === undefined) delete process.env.ANDROID_HOME;
    else process.env.ANDROID_HOME = previousHome;
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const failure = new Error('font restore rejected');
  const commands = [];
  t.mock.method(childProcess, 'execFileSync', (_file, args) => {
    commands.push(args.slice(args.indexOf('shell')));
    if (args.includes('font_scale')) throw failure;
    return '';
  });
  syncBuiltinESMExports();

  assert.throws(() => restoreDevicePresentation({ fontScale: '1', override: '1080x2400' }),
    error => error instanceof AggregateError && error.errors.includes(failure));
  assert.deepEqual(commands, [
    ['shell', 'settings', 'put', 'system', 'font_scale', '1'],
    ['shell', 'wm', 'size', '1080x2400'],
  ]);
});
