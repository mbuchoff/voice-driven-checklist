import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { adb } from './android.mjs';

function quoted(value) {
  return JSON.stringify(value);
}

export function byId(driver, testId) {
  return driver.$(`id=${testId}`);
}

export function byLabel(driver, label) {
  return driver.$(`~${label}`);
}

export function byText(driver, text) {
  return driver.$(
    `android=new UiSelector().text(${quoted(text)})`,
  );
}

export async function waitForDisplayed(element, timeout = 15_000) {
  await element.waitForDisplayed({ timeout });
  return element;
}

export async function elementRect(driver, element) {
  const resolvedElement = await element;
  return driver.getElementRect(resolvedElement.elementId);
}

export async function tapLabel(driver, label) {
  const element = byLabel(driver, label);
  await waitForDisplayed(element);
  await element.click();
}

export async function tapText(driver, text) {
  const element = byText(driver, text);
  await waitForDisplayed(element);
  await element.click();
}

export async function tapElementAt(driver, element, { xRatio = 0.5, yRatio = 0.5 } = {}) {
  const rect = await elementRect(driver, element);
  adb(['shell', 'input', 'tap',
    String(Math.round(rect.x + rect.width * xRatio)),
    String(Math.round(rect.y + rect.height * yRatio))], { capture: true });
}

export async function scrollToLabel(driver, label) {
  const selector =
    'android=new UiScrollable(new UiSelector().scrollable(true))'
    + `.scrollIntoView(new UiSelector().description(${quoted(label)}))`;
  const element = driver.$(selector);
  await waitForDisplayed(element, 20_000);
  return element;
}

export async function scrollToTextContaining(driver, text) {
  const selector =
    'android=new UiScrollable(new UiSelector().scrollable(true))'
    + `.scrollIntoView(new UiSelector().textContains(${quoted(text)}))`;
  const element = driver.$(selector);
  await waitForDisplayed(element, 20_000);
  return element;
}

export async function scrollViewport(driver, direction, percent = 0.85) {
  const window = await driver.getWindowRect();
  return driver.execute('mobile: scrollGesture', {
    left: Math.round(window.width * 0.08),
    top: Math.round(window.height * 0.14),
    width: Math.round(window.width * 0.84),
    height: Math.round(window.height * 0.72),
    direction,
    percent,
  });
}

export async function scrollToTop(driver) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const canContinue = await scrollViewport(driver, 'up', 0.95);
    if (!canContinue) return;
  }
}

export async function visibleRoutineCards(driver) {
  const cards = await driver.$$('android=new UiSelector().descriptionStartsWith("Edit ")');
  const visible = [];
  for (const card of cards) {
    if (!(await card.isDisplayed())) continue;
    visible.push({
      element: card,
      label: await card.getAttribute('content-desc'),
      rect: await elementRect(driver, card),
    });
  }
  visible.sort((left, right) =>
    left.rect.y - right.rect.y || left.rect.x - right.rect.x,
  );
  return visible;
}

export async function dragCardToEdge(driver, card, direction) {
  const cardRect = await elementRect(driver, card);
  const viewport = await elementRect(driver, byId(driver, 'library-scroll'));
  const density = await driver.getDisplayDensity() / 160;
  const start = {
    x: Math.round(cardRect.x + cardRect.width / 2),
    y: Math.round(cardRect.y + cardRect.height / 2),
  };
  const destination = {
    x: start.x,
    y: direction === 'down'
      ? Math.round(viewport.y + viewport.height - 28 * density)
      : Math.round(viewport.y + 28 * density),
  };
  await driver.performActions([
    {
      type: 'pointer',
      id: 'routine-drag',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, ...start },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 520 },
        { type: 'pointerMove', duration: 550, ...destination },
        { type: 'pause', duration: 4_200 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
  await driver.pause(2_300);
}

export async function beginCardDrag(driver, card, destination) {
  const rect = await elementRect(driver, card);
  const start = {
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
  };
  await driver.performActions([
    {
      type: 'pointer',
      id: 'interrupted-routine-drag',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, ...start },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 520 },
        { type: 'pointerMove', duration: 320, ...destination },
      ],
    },
  ]);
}

export async function scrollBeforeHoldActivation(driver, card, { holdMs = 80 } = {}) {
  const rect = await elementRect(driver, card);
  const start = {
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height * 0.7),
  };
  await driver.performActions([
    {
      type: 'pointer',
      id: 'pre-activation-scroll',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, ...start },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: holdMs },
        {
          type: 'pointerMove',
          duration: 260,
          x: start.x,
          y: Math.max(90, start.y - 280),
        },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
  await driver.pause(600);
}

export async function swipeHintAway(driver) {
  const hint = await waitForDisplayed(
    byLabel(driver, 'Learn how to move routines'),
  );
  const rect = await elementRect(driver, hint);
  const y = Math.round(rect.y + rect.height / 2);
  await driver.performActions([
    {
      type: 'pointer',
      id: 'hint-swipe',
      parameters: { pointerType: 'touch' },
      actions: [
        {
          type: 'pointerMove',
          duration: 0,
          x: Math.round(rect.x + rect.width * 0.25),
          y,
        },
        { type: 'pointerDown', button: 0 },
        {
          type: 'pointerMove',
          duration: 320,
          x: Math.round(rect.x + rect.width * 0.85),
          y,
        },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions();
  await hint.waitForDisplayed({ reverse: true, timeout: 10_000 });
}

export async function capture(driver, name) {
  const directory = resolve(process.env.E2E_ARTIFACT_DIR);
  await mkdir(directory, { recursive: true });
  await driver.saveScreenshot(resolve(directory, `${name}.png`));
  await writeFile(
    resolve(directory, `${name}.xml`),
    await driver.getPageSource(),
  );
}

export async function visibleRoutineTitles(driver) {
  return (await visibleRoutineCards(driver)).map(({ label }) =>
    label.replace(/^Edit /, ''),
  );
}

export async function collectRoutineTitles(driver) {
  await scrollToTop(driver);
  const titles = [];
  const seen = new Set();
  let unchangedPasses = 0;

  for (let attempt = 0; attempt < 30 && unchangedPasses < 2; attempt += 1) {
    const before = seen.size;
    for (const title of await visibleRoutineTitles(driver)) {
      if (seen.has(title)) continue;
      seen.add(title);
      titles.push(title);
    }
    unchangedPasses = seen.size === before ? unchangedPasses + 1 : 0;
    const canContinue = await scrollViewport(driver, 'down', 0.72);
    await driver.pause(300);
    if (!canContinue) {
      for (const title of await visibleRoutineTitles(driver)) {
        if (seen.has(title)) continue;
        seen.add(title);
        titles.push(title);
      }
      break;
    }
  }

  return titles;
}
