import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

import {
  APP_PACKAGE,
  adb,
  captureDevicePresentation,
  clearIsolatedApp,
  collapseSystemPanels,
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
import { verifyAdaptiveEdgeHold, verifySmallHoldDrift } from '../support/routineTuning.mjs';
import { openAndroidSession } from '../support/session.mjs';
import {
  beginCardDrag,
  byId,
  byLabel,
  byText,
  capture,
  collectRoutineTitles,
  dragCardToEdge,
  elementRect,
  scrollToLabel,
  scrollToTextContaining,
  scrollToTop,
  scrollBeforeHoldActivation,
  scrollViewport,
  swipeHintAway,
  tapElementAt,
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
const runId = randomUUID();
const createdDocuments = new Set();

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
  collapseSystemPanels();
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
  const downloads = driver.$(
    'android=new UiSelector().resourceId("android:id/title").text("Downloads")',
  );
  const filesInDownloads = byText(driver, 'Files in Downloads');
  // The system picker may restore Downloads directly or show its drawer.
  // Let its opening transition settle before deciding which state it is in.
  await driver.updateSettings({ waitForIdleTimeout: 500 });
  try {
    await waitForDisplayed(byLabel(driver, 'Show roots'));
    if (!(await isDisplayed(downloads)) && !(await isDisplayed(filesInDownloads))) {
      await tapLabel(driver, 'Show roots');
    }
    if (await isDisplayed(downloads)) {
      await downloads.click();
      // The file list is already exposed while the drawer is still closing.
      await downloads.waitForDisplayed({ reverse: true });
    }
    await waitForDisplayed(filesInDownloads);
    const file = await scrollToTextContaining(driver, fileName);
    await file.click();
  } finally {
    await driver.updateSettings({ waitForIdleTimeout: 0 });
  }
}

async function finishAndroidSaveDialog(fileName) {
  const filenameInput = await waitForDisplayed(
    driver.$('android=new UiSelector().className("android.widget.EditText")'),
  );
  await filenameInput.setValue(fileName);
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

async function selectLabeledOption(label) {
  await tapLabel(driver, label);
  await driver.waitUntil(
    async () => {
      try {
        return await byLabel(driver, label).getAttribute('selected') === 'true';
      } catch {
        return false;
      }
    },
    {
      timeout: 15_000,
      interval: 150,
      timeoutMsg: `${label} did not become selected`,
    },
  );
}

async function returnFromRunWithBackConfirmation() {
  await driver.back();
  await waitForDisplayed(byText(driver, 'Stop run?'));
  const cancelButton = await waitForDisplayed(
    driver.$('id=android:id/button2'),
  );
  await cancelButton.click();
  await waitForDisplayed(byId(driver, 'run-header'));

  await driver.back();
  await waitForDisplayed(byText(driver, 'Stop run?'));
  const stopButton = await waitForDisplayed(
    driver.$('id=android:id/button1'),
  );
  await stopButton.click();
  await waitForDisplayed(byId(driver, 'library-safe-area'));
}

before(async () => {
  driver = await openAndroidSession();
  presentation = captureDevicePresentation();
});

after(async () => {
  for (const remotePath of createdDocuments) {
    try {
      adb(['shell', 'rm', '-f', remotePath]);
    } catch (error) {
      console.error(`Could not remove this run's document ${remotePath}: ${error.message}`);
    }
  }
  if (presentationChanged && presentation) {
    restoreDevicePresentation(presentation);
  }
  if (driver) {
    try {
      await capture(driver, '99-final-state');
    } catch {
      // Preserve the original test failure if the device disconnected.
    }
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
    const backupName = `voice-checklist-e2e-import-${runId}.json`;
    createdDocuments.add(`/sdcard/Download/${backupName}`);
    pushFixture(fixturePath, backupName);

    collapseSystemPanels();
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

    console.info('Checking imported order, layout, and gesture arbitration');
    assert.deepEqual(await collectRoutineTitles(driver), expectedTitles);
    await expectTopTitle(firstTitle);

    const firstCard = byLabel(driver, `Edit ${firstTitle}`);
    const secondCard = byLabel(driver, `Edit ${secondTitle}`);
    const [firstRect, secondRect] = await Promise.all([
      elementRect(driver, firstCard),
      elementRect(driver, secondCard),
    ]);
    assert.equal(firstRect.y, secondRect.y, 'phone layout should have two columns');
    assert.equal(firstRect.height, secondRect.height, 'cards should have fixed heights');
    assert.notEqual(firstRect.x, secondRect.x, 'cards should occupy distinct columns');
    assert.match(
      await driver.getPageSource(),
      new RegExp(fixture.checklists[0].items[1].text),
      'the accessibility tree should retain the full clipped step list',
    );

    const [titleRect, newRect, settingsRect] = await Promise.all([
      elementRect(driver, byText(driver, 'Routines')),
      elementRect(driver, byLabel(driver, 'New checklist')),
      elementRect(driver, byLabel(driver, 'Settings')),
    ]);
    const centersY = [titleRect, newRect, settingsRect].map(
      ({ y, height }) => y + height / 2,
    );
    assert.ok(
      Math.max(...centersY) - Math.min(...centersY) <= 2,
      'the title, New, and Settings controls should share one header row',
    );
    assert.ok(
      titleRect.x < newRect.x && newRect.x < settingsRect.x,
      'the header should arrange the title, New, and Settings from left to right',
    );

    const firstYBeforeScroll = (await elementRect(driver, firstCard)).y;
    await scrollBeforeHoldActivation(driver, firstCard);
    assert.ok(
      (await elementRect(driver, firstCard)).y < firstYBeforeScroll - 20,
      'moving before hold activation should scroll instead of beginning a drag',
    );
    assert.equal(await isDisplayed(byId(driver, 'editor-safe-area')), false);

    await expectTopTitle(firstTitle);
    await verifySmallHoldDrift(driver, byLabel(driver, `Edit ${firstTitle}`));
    console.info('Small thumb drift activated drag');
    const beforeFeedbackScroll = (await elementRect(driver, firstCard)).y;
    await scrollBeforeHoldActivation(driver, byLabel(driver, `Edit ${firstTitle}`), { holdMs: 260 });
    assert.ok((await elementRect(driver, firstCard)).y < beforeFeedbackScroll - 20,
      'moving after hold feedback starts should still scroll before activation');
    assert.equal(await isDisplayed(byId(driver, 'editor-safe-area')), false);
    assert.equal(await isDisplayed(byId(driver, 'routine-drop-slot')), false);
    await expectTopTitle(firstTitle);
    await verifyAdaptiveEdgeHold(driver, 'bottom');
    console.info('Adaptive bottom-edge hold, outward scroll, and retreat passed');
    assert.deepEqual(await collectRoutineTitles(driver), expectedTitles,
      'native touch cancellation should restore the original routine order');
    await expectTopTitle(firstTitle);

    resetFrameMetrics();
    for (let swipe = 0; swipe < 3; swipe += 1) {
      await scrollViewport(driver, 'down', 0.65);
      await scrollViewport(driver, 'up', 0.65);
    }
    const scrollFrames = readFrameMetrics();
    assert.ok(parseGfxInfo(scrollFrames).totalFrames > 0);
    await writeFile(resolve(process.env.E2E_ARTIFACT_DIR, 'scroll-gfxinfo.txt'), scrollFrames);
    await writeFile(resolve(process.env.E2E_ARTIFACT_DIR, 'scroll-frame-summary.json'),
      JSON.stringify(parseGfxInfo(scrollFrames), null, 2));

    await scrollToLabel(driver, `Edit ${lastTitle}`);
    assert.equal(await byLabel(driver, 'New checklist').isDisplayed(), true);
    assert.equal(await byLabel(driver, 'Settings').isDisplayed(), true);
    await capture(driver, '02-library-seventeen-routines');
    console.info('Ordinary scrolling measured; checking lesson and reordering');

    await scrollToTop(driver);
    const arrangeHint = await waitForDisplayed(
      byLabel(driver, 'Learn how to move routines'),
    );
    await tapElementAt(driver, arrangeHint, { yRatio: 0.2 });
    await waitForDisplayed(
      byLabel(driver, 'Demonstrating how to move a routine'),
    );
    await capture(driver, '03-full-screen-arrange-lesson');
    await byLabel(driver, 'Demonstrating how to move a routine')
      .waitForDisplayed({ reverse: true, timeout: 10_000 });
    await waitForDisplayed(byLabel(driver, 'Learn how to move routines'));

    // Capture can outlast the short lesson. Check Back on a fresh showing.
    await tapElementAt(driver, arrangeHint, { yRatio: 0.2 });
    await waitForDisplayed(byLabel(driver, 'Demonstrating how to move a routine'));
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
    assert.deepEqual(await collectRoutineTitles(driver), [...expectedTitles.slice(1), firstTitle]);
    await capture(driver, '04-first-routine-moved-last');

    await driver.terminateApp(APP_PACKAGE);
    await activateLibrary();
    await expectTopTitle(secondTitle);
    assert.deepEqual(await collectRoutineTitles(driver), [...expectedTitles.slice(1), firstTitle]);

    const movedFirstCard = await scrollToLabel(driver, `Edit ${firstTitle}`);
    await dragCardToEdge(driver, movedFirstCard, 'up');
    await expectTopTitle(firstTitle);
    assert.deepEqual(await collectRoutineTitles(driver), expectedTitles);
    await capture(driver, '05-last-routine-restored-first');
    console.info('Offscreen reorder and relaunch persistence passed');

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
    const interruptRect = await elementRect(driver, interruptCard);
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
    console.info('Checking editor keyboard, runs, create/delete, and Settings');
    const lastStep = await scrollToLabel(driver, 'Hold row 11 to reorder');
    await lastStep.click();
    const lastStepInput = await waitForDisplayed(byId(driver, 'item-text-10'));
    await lastStepInput.setValue('Make coffee and place the mug beside breakfast');
    assert.equal(await driver.isKeyboardShown(), true);
    const [inputRect, windowRect] = await Promise.all([
      elementRect(driver, lastStepInput),
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
    const confirmDelete = await waitForDisplayed(
      driver.$('id=android:id/button1'),
    );
    await confirmDelete.click();
    await waitForDisplayed(byId(driver, 'library-safe-area'));
    await expectTopTitle(firstTitle);
    assert.equal(await isDisplayed(byLabel(driver, `Edit ${temporaryTitle}`)), false);

    await openSettings();
    await selectLabeledOption('Dark. Deep forest');
    await returnFromSettings();
    await expectTopTitle(firstTitle);
    await capture(driver, '07-dark-theme-library');

    await openSettings();
    await selectLabeledOption('Light. Warm and bright');
    await returnFromSettings();
    await expectTopTitle(firstTitle);
    await capture(driver, '08-light-theme-library');

    await openSettings();
    await selectLabeledOption('System. Match this device');
    for (const sound of [
      'Wooden Tap. Soft and tactile',
      'Bright Ping. Clear and upbeat',
      'Quiet. No sounds',
      'Soft Chime. Warm and gentle',
    ]) {
      await selectLabeledOption(sound);
    }

    const localAccount = await scrollToLabel(
      driver,
      'This device. Local checklist library. Selected',
    );
    assert.equal(await localAccount.isDisplayed(), true);

    const exportName = `voice-checklist-e2e-export-${runId}.json`;
    const exportPath = `/sdcard/Download/${exportName}`;
    createdDocuments.add(exportPath);
    const exportButton = await scrollToLabel(driver, 'Export backup');
    await exportButton.click();
    await finishAndroidSaveDialog(exportName);
    await waitForDisplayed(byId(driver, 'settings-safe-area'), 30_000);
    const exportedFiles = adb(
      [
        'shell',
        'find',
        '/sdcard/Download',
        '-maxdepth',
        '1',
        '-name',
        exportName,
      ],
      { capture: true },
    ).trim();
    assert.notEqual(exportedFiles, '', 'Android export should write a backup file');
    const exportedText = adb(['shell', 'cat', exportPath], { capture: true });
    await writeFile(resolve(process.env.E2E_ARTIFACT_DIR, 'exported-backup.json'), exportedText);
    const exported = JSON.parse(exportedText);
    assert.deepEqual(Object.keys(exported).sort(), ['checklists', 'exportedAt', 'format', 'version']);
    assert.equal(exported.format, 'voice-driven-checklist-backup');
    assert.equal(exported.version, 1);
    assert.equal(Number.isNaN(Date.parse(exported.exportedAt)), false);
    const expectedBackup = structuredClone(fixture.checklists);
    expectedBackup[0].items[10].text = 'Make coffee and place the mug beside breakfast';
    assert.deepEqual(exported.checklists, expectedBackup,
      'backup must retain routine/step order and edits, with checklist-only data');
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
