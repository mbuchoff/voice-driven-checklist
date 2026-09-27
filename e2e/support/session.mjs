import { resolve } from 'node:path';

import { remote } from 'webdriverio';

import { APP_PACKAGE } from './android.mjs';

export function androidAdbCapabilities(environment = process.env) {
  if (environment.ANDROID_ADB_SERVER_ADDRESS !== undefined || environment.ANDROID_ADB_SERVER_PORT !== undefined) {
    throw new Error('Unset ANDROID_ADB_SERVER_ADDRESS and ANDROID_ADB_SERVER_PORT; select the local server using ADB_SERVER_SOCKET instead.');
  }
  const socket = environment.ADB_SERVER_SOCKET;
  if (!socket) return {};
  // Appium supplies -P, which makes adb ignore ADB_SERVER_SOCKET. Mirror the
  // local endpoint explicitly; remote-server forwarding is not supported here.
  const match = /^tcp:(?:(127\.0\.0\.1|localhost):)?([1-9]\d{0,4})$/.exec(socket);
  if (!match || Number(match[2]) > 65535) {
    throw new Error('E2E requires a local TCP ADB server. Pair directly to this container and unset ADB_SERVER_SOCKET, or use tcp:127.0.0.1:<port>. Remote and Unix-socket forwarding are not supported.');
  }
  return {
    'appium:remoteAdbHost': match[1] ?? 'localhost',
    'appium:adbPort': Number(match[2]),
  };
}

export function androidSessionCapabilities(apk, environment = process.env) {
  const capabilities = {
    ...androidAdbCapabilities(environment),
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:app': resolve(apk),
    'appium:enforceAppInstall': true,
    'appium:androidInstallTimeout': 300_000,
    'appium:autoLaunch': false,
    'appium:noReset': false,
    'appium:fullReset': false,
    'appium:newCommandTimeout': 240,
    'appium:disableIdLocatorAutocompletion': true,
    'appium:appPackage': APP_PACKAGE,
  };
  if (environment.ANDROID_SERIAL) {
    capabilities['appium:udid'] = environment.ANDROID_SERIAL;
  }

  return capabilities;
}

export async function openAndroidSession() {
  const capabilities = androidSessionCapabilities(process.env.E2E_APK);

  const driver = await remote({
    protocol: 'http',
    hostname: process.env.APPIUM_HOST ?? '127.0.0.1',
    port: Number(process.env.APPIUM_PORT ?? 4723),
    path: '/',
    logLevel: process.env.WDIO_LOG_LEVEL ?? 'warn',
    // Wireless APK transfer can outlast WebdriverIO's two-minute default.
    connectionRetryTimeout: 360_000,
    capabilities,
  });
  await driver.updateSettings({ waitForIdleTimeout: 0 });
  return driver;
}
