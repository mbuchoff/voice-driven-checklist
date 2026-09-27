import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixtureUrl = new URL('../fixtures/17-routines.json', import.meta.url);

test('the physical-device fixture is a version-one backup with 17 realistic routines', async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));

  assert.equal(fixture.format, 'voice-driven-checklist-backup');
  assert.equal(fixture.version, 1);
  assert.equal(fixture.checklists.length, 17);
  assert.ok(fixture.checklists.every((routine) => routine.items.length >= 3));
  assert.ok(
    fixture.checklists.some((routine) =>
      routine.items.some((item) => item.text.length >= 45),
    ),
  );
  assert.ok(
    fixture.checklists.some(({ title }) => title.length >= 40),
    'fixture should exercise a long routine title',
  );
  assert.equal(new Set(fixture.checklists.map(({ title }) => title)).size, 17);
});
