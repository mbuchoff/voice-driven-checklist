import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

import {
  APP_PACKAGE,
  adb,
  captureDevicePresentation,
  clearIsolatedApp,
  createVersionTwoDatabase,
  grantRunPermissions,
  installVersionTwoDatabase,
  pushFixture,
  readFrameMetrics,
  resetFrameMetrics,
  restoreDevicePresentation,
  setDevicePresentation,
} from '../support/android.mjs';
import { parseGfxInfo } from '../support/performance.mjs';
import { openAndroidSession } from '../support/session.mjs';
import {
  beginCardDrag,
  byId,
  byLabel,
  byText,
  capture,
  collectRoutineTitles,
  dragCardToEdge,
  scrollToLabel,
  scrollToTextContaining,
  scrollToTop,
  scrollBeforeHoldActivation,
  swipeHintAway,
  tapLabel,
  tapText,
  visibleRoutineTitles,
  waitForDisplayed,
} from '../support/ui.mjs';

const e2eRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(e2eRoot, 'fixtures/17-routines.json');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const expectedTitles = fixture.checklists.map(({ title }) => title);
const firstTitle = expectedTitles[0];
const secondTitle = expectedTitles[1];
const lastTitle = expectedTitles.at(-1);
const temporaryTitle = 'E2E Temporary Routine';

let driver;
let presentation;
let presentationChanged = false;

async function isDisplayed(element) {
  try {
    return await element.isDisplayed();
  } catch {
    return false;
  }
}

async function activateLibrary() {
  await driver.activateApp(APP_PACKAGE);
  await waitForDisplayed(byId(driver, 'library-safe-area'), 30_000);
}

async function expectTopTitle(title) {
  await scrollToTop(driver);
  await driver.waitUntil(
    async () => (await visibleRoutineTitles(driver))[0] === title,
    {
      timeout: 15_000,
      interval: 250,
      timeoutMsg: `Expected ${title} to be the first visible routine`,
    },
  );
}

async function openSettings() {
  await tapLabel(driver, 'Settings');
  await waitForDisplayed(byId(driver, 'settings-safe-area'));
}

async function returnFromSettings() {
  await tapLabel(driver, 'Back to my checklists');
  await waitForDisplayed(byId(driver, 'library-safe-area'));
}

async function selectDocument(fileName) {
  await tapLabel(driver, 'Show roots');
  await tapText(driver, 'Downloads');
  const file = await scrollToTextContaining(driver, fileName);
  await file.click();
}

async function finishAndroidSaveDialog() {
  const candidates = [
    driver.$('id=com.google.android.documentsui:id/action_menu_save'),
    byText(driver, 'Save'),
    byText(driver, 'SAVE'),
  ];
  let saveButton;
  await driver.waitUntil(
    async () => {
      for (const candidate of candidates) {
        if (await isDisplayed(candidate)) {
          saveButton = candidate;
          return true;
        }
      }
      return false;
    },
    {
      timeout: 20_000,
      interval: 250,
      timeoutMsg: 'Android save dialog did not expose its Save action.',
    },
  );
  await saveButton.click();
}

async function openEditor(title) {
  const card = await scrollToLabel(driver, `Edit ${title}`);
  await card.click();
  await waitForDisplayed(byId(driver, 'editor-safe-area'));
}

async function returnFromRunWithBackConfirmation() {
  await driver.back();
  await waitForDisplayed(byText(driver, 'Stop run?'));
  await tapText(driver, 'Cancel');
  await waitForDisplayed(byId(driver, 'run-header'));

  await driver.back();
  await waitForDisplayed(byText(driver, 'Stop run?'));
  await tapText(driver, 'Stop');
  await waitForDisplayed(byId(driver, 'library-safe-area'));
}

before(async () => {
  driver = await openAndroidSession();
  presentation = captureDevicePresentation();
});

after(async () => {
  if (presentationChanged && presentation) {
    restoreDevicePresentation(presentation);
  }
  if (driver) {
    try {
      await driver.releaseActions();
    } catch {
      // There may be no active input source to release after a failed scenario.
    }
    await driver.deleteSession();
  }
});

test(
  'migrates a real version-two library without visibly reordering it',
  { timeout: 120_000 },
  async () => {
    const databasePath = resolve(
      process.env.E2E_ARTIFACT_DIR,
      'version-two-library.db',
    );
    createVersionTwoDatabase(databasePath);
    installVersionTwoDatabase(databasePath);

    await activateLibrary();
    assert.deepEqual(
      await visibleRoutineTitles(driver),
      ['Legacy Alpha', 'Legacy Zulu', 'Legacy Older'],
    );
    await capture(driver, '01-version-two-migration');

    await driver.terminateApp(APP_PACKAGE);
  },
);

test(
  'exercises the complete Your Routines journey through real Android UI and SQLite',
  { timeout: 16 * 60_000 },
  async () => {
    clearIsolatedApp();
    const backupName = 'voice-checklist-gh36.json';
    pushFixture(fixturePath, backupName);

    await driver.activateApp(APP_PACKAGE);
    await tapText(driver, 'Use on this device');
    await waitForDisplayed(byId(driver, 'library-empty-state'));

    await openSettings();
    const importButton = await scrollToLabel(driver, 'Import backup');
    await importButton.click();
    await selectDocument(backupName);
    await waitForDisplayed(byText(driver, 'Import complete'), 30_000);
    await tapText(driver, 'OK');
    await returnFromSettings();

    assert.deepEqual(await collectRoutineTitles(driver), expectedTitles);
    await expectTopTitle(firstTitle);

    const firstCard = byLabel(driver, `Edit ${firstTitle}`);
    const secondCard = byLabel(driver, `Edit ${secondTitle}`);
    const [firstRect, secondRect] = await Promise.all([
      firstCard.getRect(),
      secondCard.getRect(),
    ]);
    assert.equal(firstRect.y, secondRect.y, 'phone layout should have two columns');
    assert.equal(firstRect.height, secondRect.height, 'cards should have fixed heights');
    assert.notEqual(firstRect.x, secondRect.x, 'cards should occupy distinct columns');
    assert.match(
      await driver.getPageSource(),
      new RegExp(fixture.checklists[0].items[1].text),
      'the accessibility tree should retain the full clipped step list',
    );

    const firstYBeforeScroll = (await firstCard.getRect()).y;
    await scrollBeforeHoldActivation(driver, firstCard);
    assert.ok(
      (await firstCard.getRect()).y < firstYBeforeScroll - 20,
      'moving before hold activation should scroll instead of beginning a drag',
    );
    assert.equal(await isDisplayed(byId(driver, 'editor-safe-area')), false);

    await scrollToLabel(driver, `Edit ${lastTitle}`);
    assert.equal(await byLabel(driver, 'New checklist').isDisplayed(), true);
    assert.equal(await byLabel(driver, 'Settings').isDisplayed(), true);
    await capture(driver, '02-library-seventeen-routines');

    await scrollToTop(driver);
    await tapLabel(driver, 'Learn how to move routines');
    await waitForDisplayed(byId(driver, 'routine-arrange-lesson-modal'));
    await capture(driver, '03-full-screen-arrange-lesson');
    await driver.back();
    await waitForDisplayed(byLabel(driver, 'Learn how to move routines'));

    await swipeHintAway(driver);
    await driver.terminateApp(APP_PACKAGE);
    await activateLibrary();
    assert.equal(
      await isDisplayed(byLabel(driver, 'Learn how to move routines')),
      false,
      'dismissed teaching hint should remain dismissed after relaunch',
    );

    resetFrameMetrics();
    await expectTopTitle(firstTitle);
    await dragCardToEdge(driver, byLabel(driver, `Edit ${firstTitle}`), 'down');
    await expectTopTitle(secondTitle);
    await capture(driver, '04-first-routine-moved-last');

    await driver.terminateApp(APP_PACKAGE);
    await activateLibrary();
    await expectTopTitle(secondTitle);

    const movedFirstCard = await scrollToLabel(driver, `Edit ${firstTitle}`);
    await dragCardToEdge(driver, movedFirstCard, 'up');
    await expectTopTitle(firstTitle);
    await capture(driver, '05-last-routine-restored-first');

    const frameOutput = readFrameMetrics();
    const frameMetrics = parseGfxInfo(frameOutput);
    assert.ok(frameMetrics.totalFrames > 0);
    await writeFile(
      resolve(process.env.E2E_ARTIFACT_DIR, 'reorder-gfxinfo.txt'),
      frameOutput,
    );
    await writeFile(
      resolve(process.env.E2E_ARTIFACT_DIR, 'reorder-frame-summary.json'),
      `${JSON.stringify(frameMetrics, null, 2)}\n`,
    );

    await expectTopTitle(firstTitle);
    const stableOrder = await collectRoutineTitles(driver);
    await expectTopTitle(firstTitle);
    const interruptCard = byLabel(driver, `Edit ${secondTitle}`);
    const interruptRect = await interruptCard.getRect();
    await beginCardDrag(driver, interruptCard, {
      x: Math.round(interruptRect.x + interruptRect.width / 2),
      y: Math.round(interruptRect.y + interruptRect.height * 1.7),
    });
    await driver.background(2);
    try {
      await driver.releaseActions();
    } catch {
      // App backgrounding may already dispose the active pointer source.
    }
    await waitForDisplayed(byId(driver, 'library-safe-area'));
    assert.deepEqual(await collectRoutineTitles(driver), stableOrder);

    await expectTopTitle(firstTitle);
    await openEditor(firstTitle);
    const lastStep = await scrollToLabel(driver, 'Hold row 11 to reorder');
    await lastStep.click();
    const lastStepInput = await waitForDisplayed(byId(driver, 'item-text-10'));
    await lastStepInput.setValue('Make coffee and place the mug beside breakfast');
    assert.equal(await driver.isKeyboardShown(), true);
    const [inputRect, windowRect] = await Promise.all([
      lastStepInput.getRect(),
      driver.getWindowRect(),
    ]);
    assert.ok(
      inputRect.y + inputRect.height <= windowRect.height,
      'focused editor row should remain above the resized keyboard viewport',
    );
    await byId(driver, 'save').click();
    await waitForDisplayed(byId(driver, 'library-safe-area'));
    await expectTopTitle(firstTitle);

    grantRunPermissions();
    await tapLabel(driver, `Start ${firstTitle}`);
    await waitForDisplayed(byId(driver, 'run-header'), 45_000);
    await byId(driver, 'manual-next').click();
    await returnFromRunWithBackConfirmation();
    await expectTopTitle(firstTitle);

    await tapLabel(driver, `Start ${firstTitle}`);
    await waitForDisplayed(byId(driver, 'run-header'), 45_000);
    for (let index = 0; index < fixture.checklists[0].items.length; index += 1) {
      await byId(driver, 'manual-next').click();
      await driver.pause(180);
    }
    await waitForDisplayed(byId(driver, 'completion-screen'), 30_000);
    await capture(driver, '06-run-completion');
    await byId(driver, 'completion-return').click();
    await waitForDisplayed(byId(driver, 'library-safe-area'));
    await expectTopTitle(firstTitle);

    await tapLabel(driver, 'New checklist');
    await waitForDisplayed(byId(driver, 'editor-safe-area'));
    await byId(driver, 'title-input').setValue(temporaryTitle);
    await byLabel(driver, 'Hold row 1 to reorder').click();
    await byId(driver, 'item-text-0').setValue('Temporary step');
    await byId(driver, 'save').click();
    await waitForDisplayed(byId(driver, 'library-safe-area'));
    await expectTopTitle(temporaryTitle);

    await openEditor(temporaryTitle);
    const deleteRoutine = await scrollToLabel(
      driver,
      `Delete ${temporaryTitle}`,
    );
    await deleteRoutine.click();
    await waitForDisplayed(byText(driver, 'Delete checklist?'));
    await tapText(driver, 'Delete');
    await waitForDisplayed(byId(driver, 'library-safe-area'));
    await expectTopTitle(firstTitle);
    assert.equal(await isDisplayed(byLabel(driver, `Edit ${temporaryTitle}`)), false);

    await openSettings();
    await tapLabel(driver, 'Dark. Deep forest');
    assert.equal(
      await byLabel(driver, 'Dark. Deep forest').getAttribute('selected'),
      'true',
    );
    await returnFromSettings();
    await expectTopTitle(firstTitle);
    await capture(driver, '07-dark-theme-library');

    await openSettings();
    await tapLabel(driver, 'Light. Warm and bright');
    await returnFromSettings();
    await expectTopTitle(firstTitle);
    await capture(driver, '08-light-theme-library');

    await openSettings();
    await tapLabel(driver, 'System. Match this device');
    for (const sound of [
      'Wooden Tap. Soft and tactile',
      'Bright Ping. Clear and upbeat',
      'Quiet. No sounds',
      'Soft Chime. Warm and gentle',
    ]) {
      await tapLabel(driver, sound);
    }

    const localAccount = await scrollToLabel(
      driver,
      'This device. Local checklist library. Selected',
    );
    assert.equal(await localAccount.isDisplayed(), true);

    adb(['shell', 'rm', '-f', '/sdcard/Download/voice-checklist-backup.json']);
    const exportButton = await scrollToLabel(driver, 'Export backup');
    await exportButton.click();
    await finishAndroidSaveDialog();
    await waitForDisplayed(byId(driver, 'settings-safe-area'), 30_000);
    const exportedFiles = adb(
      [
        'shell',
        'find',
        '/sdcard/Download',
        '-maxdepth',
        '1',
        '-name',
        'voice-checklist-backup*.json',
      ],
      { capture: true },
    ).trim();
    assert.notEqual(exportedFiles, '', 'Android export should write a backup file');
    await returnFromSettings();

    presentationChanged = true;
    setDevicePresentation({ fontScale: 1.3, size: '720x1600' });
    await driver.terminateApp(APP_PACKAGE);
    await activateLibrary();
    await expectTopTitle(firstTitle);
    assert.equal(await byLabel(driver, 'New checklist').isDisplayed(), true);
    assert.equal(await byLabel(driver, 'Settings').isDisplayed(), true);
    await capture(driver, '09-large-font-narrow-viewport');

    restoreDevicePresentation(presentation);
    presentationChanged = false;
    await driver.terminateApp(APP_PACKAGE);
    await activateLibrary();
    await expectTopTitle(firstTitle);
  },
);
