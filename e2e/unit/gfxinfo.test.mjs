import assert from 'node:assert/strict';
import test from 'node:test';

import { parseGfxInfo } from '../support/performance.mjs';

test('extracts Android frame totals and jank percentage', () => {
  const metrics = parseGfxInfo(`
    Total frames rendered: 240
    Janky frames: 18 (7.50%)
  `);

  assert.deepEqual(metrics, {
    totalFrames: 240,
    jankyFrames: 18,
    jankyPercent: 7.5,
  });
});

test('rejects gfxinfo output that has no render summary', () => {
  assert.throws(() => parseGfxInfo('No process found'), /frame summary/i);
});
