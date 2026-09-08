import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';

export const APP_PACKAGE = 'com.mbuchoff.voicechecklist.e2e';

function androidSdkRoot() {
  const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!androidHome) {
    throw new Error('Set ANDROID_HOME or ANDROID_SDK_ROOT before running E2E.');
  }
  return androidHome;
}

export function assertIsolatedApk(apk) {
  let identity;
  try {
    const analyzer = resolve(androidSdkRoot(), 'cmdline-tools', 'latest', 'bin', 'apkanalyzer');
    identity = execFileSync(analyzer, ['manifest', 'application-id', resolve(apk)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    }).trim();
  } catch (cause) {
    throw new Error('Could not verify APK identity. Install Android SDK Command-line Tools (latest) and check ANDROID_HOME and the APK.', { cause });
  }
  if (identity !== APP_PACKAGE) {
    throw new Error(`Refusing APK for ${identity || '(missing package)'}; E2E requires exactly ${APP_PACKAGE}.`);
  }
}

export function adb(args, options = {}) {
  const serialArgs = process.env.ANDROID_SERIAL
    ? ['-s', process.env.ANDROID_SERIAL]
    : [];
  return execFileSync(resolve(androidSdkRoot(), 'platform-tools', 'adb'), [...serialArgs, ...args], {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...options,
  });
}

export function clearIsolatedApp() {
  adb(['shell', 'pm', 'clear', APP_PACKAGE]);
  adb(['shell', 'am', 'force-stop', APP_PACKAGE]);
}

export function collapseSystemPanelsArguments() {
  return ['shell', 'cmd', 'statusbar', 'collapse'];
}

export function collapseSystemPanels() {
  adb(collapseSystemPanelsArguments());
}

export function createVersionTwoDatabase(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
  rmSync(filePath, { force: true });
  const database = new Database(filePath);
  try {
    database.exec(readFileSync(new URL('../fixtures/schema-v2.sql', import.meta.url), 'utf8'));
    database.exec(`
      PRAGMA foreign_keys = ON;
      INSERT INTO account_preferences
        (id, mode, cognito_sub, display_name, email)
      VALUES (1, 'local', NULL, NULL, NULL);
      INSERT INTO device_preferences (id, theme, sound)
      VALUES (1, 'dark', 'wood');
      INSERT INTO checklists (id, title, created_at, updated_at)
      VALUES
        ('legacy-older', 'Legacy Older', 10, 10),
        ('legacy-zulu', 'Legacy Zulu', 20, 30),
        ('legacy-alpha', 'Legacy Alpha', 30, 30);
      INSERT INTO checklist_items (id, checklist_id, position, text)
      VALUES
        ('legacy-older-step', 'legacy-older', 0, 'Older step'),
        ('legacy-zulu-step', 'legacy-zulu', 0, 'Zulu step'),
        ('legacy-alpha-step', 'legacy-alpha', 0, 'Alpha step');
    `);
  } finally {
    database.close();
  }
}

export function installVersionTwoDatabase(localPath) {
  const remotePath = '/data/local/tmp/voice-checklist-e2e-v2.db';
  clearIsolatedApp();
  adb(['push', localPath, remotePath]);
  adb(['shell', 'chmod', '644', remotePath]);
  adb(['shell', 'run-as', APP_PACKAGE, 'mkdir', '-p', 'files/SQLite']);
  adb([
    'shell',
    'run-as',
    APP_PACKAGE,
    'cp',
    remotePath,
    'files/SQLite/voice-checklist.db',
  ]);
  adb(['shell', 'rm', remotePath]);
}

export function captureDevicePresentation() {
  const fontScale = adb(
    ['shell', 'settings', 'get', 'system', 'font_scale'],
    { capture: true },
  ).trim();
  const size = adb(['shell', 'wm', 'size'], { capture: true });
  const override = /Override size:\s*(\d+x\d+)/.exec(size)?.[1] ?? null;
  return { fontScale, override };
}

export function setDevicePresentation({ fontScale, size }) {
  adb(['shell', 'settings', 'put', 'system', 'font_scale', String(fontScale)]);
  adb(['shell', 'wm', 'size', size]);
}

export function restoreDevicePresentation({ fontScale, override }) {
  adb(fontScale === 'null'
    ? ['shell', 'settings', 'delete', 'system', 'font_scale']
    : ['shell', 'settings', 'put', 'system', 'font_scale', fontScale]);
  adb(['shell', 'wm', 'size', override ?? 'reset']);
}

export function mediaScanArguments(remotePath) {
  return [
    'shell',
    'am',
    'broadcast',
    '-a',
    'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
    '-d',
    `file://${remotePath}`,
  ];
}

export function pushFixture(localPath, fileName) {
  const remotePath = `/sdcard/Download/${fileName}`;
  adb(['push', localPath, remotePath]);
  adb(mediaScanArguments(remotePath));
  return remotePath;
}

export function grantRunPermissions() {
  for (const permission of [
    'android.permission.RECORD_AUDIO',
    'android.permission.POST_NOTIFICATIONS',
  ]) {
    try {
      adb(['shell', 'pm', 'grant', APP_PACKAGE, permission]);
    } catch {
      // Android versions that do not expose a requested runtime permission
      // do not need it granted before the run screen opens.
    }
  }
}

export function resetFrameMetrics() {
  adb(
    ['shell', 'dumpsys', 'gfxinfo', APP_PACKAGE, 'reset'],
    { capture: true },
  );
}

export function readFrameMetrics() {
  return adb(
    ['shell', 'dumpsys', 'gfxinfo', APP_PACKAGE],
    { capture: true },
  );
}
