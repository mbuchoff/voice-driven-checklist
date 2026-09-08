import { resolve } from 'node:path';

import { remote } from 'webdriverio';

import { APP_PACKAGE } from './android.mjs';

export function androidSessionCapabilities(apk) {
  const capabilities = {
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
  if (process.env.ANDROID_SERIAL) {
    capabilities['appium:udid'] = process.env.ANDROID_SERIAL;
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
