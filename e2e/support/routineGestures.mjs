import assert from 'node:assert/strict';
import { adb } from './android.mjs';
import { byId, elementRect, visibleRoutineCards, waitForDisplayed } from './ui.mjs';

const pointerId = 'routine-gesture';

async function pointer(driver, actions) {
  await driver.performActions([{ type: 'pointer', id: pointerId,
    parameters: { pointerType: 'touch' }, actions }]);
}

function touch(action, x, y) {
  // UiAutomator2 does not continue a pressed pointer across W3C action calls.
  // Native motion events let us inspect the UI between moves in one hold.
  adb(['shell', 'input', 'touchscreen', 'motionevent', action,
    String(Math.round(x)), String(Math.round(y))], { capture: true });
}

export async function verifySmallHoldDrift(driver, card) {
  const rect = await elementRect(driver, card);
  const density = await driver.getDisplayDensity() / 160;
  const x = Math.round(rect.x + rect.width * 0.3);
  const y = Math.round(rect.y + rect.height * 0.3);
  // Exercise native activation, not only the JS distance guard. Vertical drift
  // can cross Android's scroll slop while remaining inside our hold allowance.
  const samples = [
    { name: 'stationary', dx: 0, dy: 0, holdMs: 80 },
    { name: 'right', dx: 16, dy: 0, holdMs: 80 },
    { name: 'left', dx: -16, dy: 0, holdMs: 80 },
    { name: 'down', dx: 0, dy: 16, holdMs: 80 },
    { name: 'up', dx: 0, dy: -16, holdMs: 80 },
    { name: 'diagonal during feedback', dx: 12, dy: -12, holdMs: 260 },
  ];
  for (const { name, dx, dy, holdMs } of samples) {
    const destination = {
      x: Math.round(x + dx * density),
      y: Math.round(y + dy * density),
    };
    try {
      await pointer(driver, [
        { type: 'pointerMove', duration: 0, x, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: holdMs },
        { type: 'pointerMove', duration: 110, ...destination },
        { type: 'pause', duration: 400 },
      ]);
      await byId(driver, 'routine-drop-slot').waitForDisplayed({
        timeout: 4_000,
        timeoutMsg: `${name} drift within the allowance must activate dragging`,
      });
    } finally {
      // Cancel without moving to a different slot or persisting a new order.
      touch('CANCEL', destination.x, destination.y);
      await driver.releaseActions();
    }
    await byId(driver, 'routine-drop-slot').waitForDisplayed({ reverse: true });
    await waitForDisplayed(byId(driver, 'library-safe-area'));
    await driver.pause(500);
  }
}

export async function verifyAdaptiveEdgeHold(driver, edge) {
  const viewport = await elementRect(driver, byId(driver, 'library-scroll'));
  const cards = await visibleRoutineCards(driver);
  const fullCards = cards.filter(({ rect }) => rect.y > viewport.y && rect.y + rect.height < viewport.y + viewport.height);
  const fullCard = edge === 'bottom' ? fullCards.at(-1) : fullCards[0];
  assert.ok(fullCard, 'need a full visible card to observe scrolling');
  const density = await driver.getDisplayDensity() / 160;
  const bottom = viewport.y + viewport.height;
  // Stay in the app's edge zone without entering Android's navigation strip.
  const nearEdge = edge === 'bottom' ? bottom - 40 * density : viewport.y + 40 * density;
  const candidate = cards.find(({ rect }) => nearEdge > rect.y + 6 * density && nearEdge < rect.y + rect.height - 6 * density);
  assert.ok(candidate, `need a routine in the ${edge} activation zone`);
  const probe = edge === 'bottom' ? fullCard : cards.find(({ rect }) => rect.y > candidate.rect.y + candidate.rect.height);
  assert.ok(probe && probe !== candidate, 'need an unaffected card to observe scrolling');
  // Android clips accessibility bounds at the viewport. Observe the trailing
  // edge, which stays visible as this unaffected card scrolls away.
  const probeY = () => elementRect(driver, probe.element).then(rect =>
    edge === 'bottom' ? rect.y + rect.height : rect.y);
  const x = Math.round(candidate.rect.x + candidate.rect.width * 0.3);
  const y = Math.round(nearEdge);
  const direction = edge === 'bottom' ? 1 : -1;
  let pointerY = y;
  const move = (nextY) => {
    pointerY = Math.round(nextY);
    touch('MOVE', x, pointerY);
  };
  const expectStationary = async () => {
    const before = await probeY();
    await driver.pause(300);
    assert.ok(Math.abs(await probeY() - before) <= 2, 'stationary edge hold must not scroll');
  };
  const expectScroll = async (nextY, stopY) => {
    const before = await probeY();
    move(nextY);
    await driver.pause(220);
    // Stop at the current boundary before inspecting. A slow accessibility
    // query must not let autoscroll carry the observed card offscreen (where
    // UiAutomator may scroll it back into view to resolve its bounds).
    move(stopY);
    const after = await probeY();
    assert.ok((before - after) * direction > 2, `moving outward must scroll (${before} -> ${after})`);
  };
  try {
    touch('DOWN', x, y);
    await waitForDisplayed(byId(driver, 'routine-drop-slot'));
    await expectStationary();
    await expectScroll(y + direction * 12 * density, y);
    move(y - direction * 12 * density);
    await expectStationary();
    await expectScroll(y - direction * 4 * density, y - direction * 12 * density);
  } finally {
    // Cancel rather than persisting a changed order, including on assertion failure.
    touch('CANCEL', x, pointerY);
    await driver.releaseActions();
  }
  await byId(driver, 'routine-drop-slot').waitForDisplayed({ reverse: true });
}
