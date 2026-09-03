import { resolve } from 'node:path';

import { remote } from 'webdriverio';

import { APP_PACKAGE } from './android.mjs';

export async function openAndroidSession() {
  const capabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:app': resolve(process.env.E2E_APK),
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

  const driver = await remote({
    protocol: 'http',
    hostname: process.env.APPIUM_HOST ?? '127.0.0.1',
    port: Number(process.env.APPIUM_PORT ?? 4723),
    path: '/',
    logLevel: process.env.WDIO_LOG_LEVEL ?? 'warn',
    capabilities,
  });
  await driver.updateSettings({ waitForIdleTimeout: 0 });
  return driver;
}
