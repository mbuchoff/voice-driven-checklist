import {
  createRoutine,
  deleteRoutine,
  exportAllRoutines,
  getRoutine,
  importRoutines,
  listRoutines,
  reorderRoutines,
  restoreRoutine,
  updateRoutine,
} from './repository';
import { isRoutineColorKey } from './routineColors';
import { runMigrations } from '@/src/db/migrations';
import type { Database } from '@/src/db/database';
import { createTestDatabase } from '@/src/test/createTestDatabase';

async function setup(): Promise<Database> {
  const db = createTestDatabase();
  await runMigrations(db);
  return db;
}

describe('routine repository', () => {
  describe('createRoutine', () => {
    it('persists a routine with items in order', async () => {
      const db = await setup();
      const created = await createRoutine(db, {
        title: 'Morning routine',
        steps: [{ text: 'Wake up' }, { text: 'Brush teeth' }],
      });

      expect(created.title).toBe('Morning routine');
      expect(created.steps).toHaveLength(2);
      expect(created.steps[0]).toMatchObject({ text: 'Wake up', order: 0 });
      expect(created.steps[1]).toMatchObject({ text: 'Brush teeth', order: 1 });
      expect(created.id).toEqual(expect.any(String));
      expect(created.steps[0].id).toEqual(expect.any(String));
    });

    it('trims the title before storage', async () => {
      const db = await setup();
      const created = await createRoutine(db, {
        title: '  Surrounded title  ',
        steps: [{ text: '  An item  ' }],
      });

      expect(created.title).toBe('Surrounded title');
      expect(created.steps[0].text).toBe('An item');
    });

    it('rejects an empty title', async () => {
      const db = await setup();
      await expect(
        createRoutine(db, { title: '   ', steps: [] }),
      ).rejects.toThrow(/Title is required/);
    });

    it('rejects an item whose text is empty after trimming', async () => {
      const db = await setup();
      await expect(
        createRoutine(db, { title: 'OK', steps: [{ text: '   ' }] }),
      ).rejects.toThrow(/Step text is required/);
    });

    it('allows creating a routine with zero items as a draft', async () => {
      const db = await setup();
      const created = await createRoutine(db, { title: 'Draft', steps: [] });
      expect(created.steps).toEqual([]);
    });

    it('places each newly saved routine first', async () => {
      const db = await setup();
      const first = await createRoutine(db, { title: 'First', steps: [] });
      const second = await createRoutine(db, { title: 'Second', steps: [] });

      await expect(listRoutines(db)).resolves.toEqual([
        expect.objectContaining({ id: second.id }),
        expect.objectContaining({ id: first.id }),
      ]);
    });
  });

  describe('getRoutine', () => {
    it('returns the persisted routine with items in position order', async () => {
      const db = await setup();
      const created = await createRoutine(db, {
        title: 'Errands',
        steps: [{ text: 'Bank' }, { text: 'Pharmacy' }, { text: 'Groceries' }],
      });

      const loaded = await getRoutine(db, created.id);
      expect(loaded?.title).toBe('Errands');
      expect(loaded?.steps.map((i) => i.text)).toEqual(['Bank', 'Pharmacy', 'Groceries']);
      expect(loaded?.steps.map((i) => i.order)).toEqual([0, 1, 2]);
    });

    it('returns null when the routine does not exist', async () => {
      const db = await setup();
      expect(await getRoutine(db, 'missing')).toBeNull();
    });
  });

  describe('listRoutines', () => {
    it('returns an empty array when there are no routines', async () => {
      const db = await setup();
      expect(await listRoutines(db)).toEqual([]);
    });

    it('orders routines by their explicit library positions', async () => {
      const db = await setup();
      await db.runAsync(
        `INSERT INTO routines
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-old',
        'Old',
        1000,
        1000,
        2,
      );
      await db.runAsync(
        `INSERT INTO routines
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-mid',
        'Mid',
        2000,
        2000,
        1,
      );
      await db.runAsync(
        `INSERT INTO routines
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-new',
        'New',
        3000,
        3000,
        0,
      );

      const list = await listRoutines(db);
      expect(list.map((row) => row.id)).toEqual(['id-new', 'id-mid', 'id-old']);
    });

    it('does not let title sorting override explicit positions', async () => {
      const db = await setup();
      const ts = 1_700_000_000_000;
      await db.runAsync(
        `INSERT INTO routines
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-c',
        'Charlie',
        ts,
        ts,
        0,
      );
      await db.runAsync(
        `INSERT INTO routines
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-a',
        'Alpha',
        ts,
        ts,
        1,
      );
      await db.runAsync(
        `INSERT INTO routines
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-b',
        'Bravo',
        ts,
        ts,
        2,
      );

      const list = await listRoutines(db);
      expect(list.map((row) => row.title)).toEqual(['Charlie', 'Alpha', 'Bravo']);
    });

    it('returns the item count for each routine', async () => {
      const db = await setup();
      const a = await createRoutine(db, { title: 'A', steps: [{ text: '1' }] });
      const b = await createRoutine(db, {
        title: 'B',
        steps: [{ text: '1' }, { text: '2' }, { text: '3' }],
      });
      const c = await createRoutine(db, { title: 'C', steps: [] });

      const list = await listRoutines(db);
      const byId = new Map(list.map((row) => [row.id, row.steps.length]));
      expect(byId.get(a.id)).toBe(1);
      expect(byId.get(b.id)).toBe(3);
      expect(byId.get(c.id)).toBe(0);
    });

    it('returns every item in step order without another repository read', async () => {
      const db = await setup();
      await createRoutine(db, {
        title: 'Morning',
        steps: [
          { text: 'Open blinds' },
          { text: 'Drink water' },
          { text: 'Make bed' },
        ],
      });

      await expect(listRoutines(db)).resolves.toEqual([
        expect.objectContaining({
          title: 'Morning',
          steps: [
            { text: 'Open blinds' },
            { text: 'Drink water' },
            { text: 'Make bed' },
          ],
        }),
      ]);
    });

    it('keeps a manually arranged routine in place after editing it', async () => {
      const db = await setup();
      const first = await createRoutine(db, { title: 'First', steps: [] });
      const second = await createRoutine(db, { title: 'Second', steps: [] });
      await reorderRoutines(db, [first.id, second.id]);

      await updateRoutine(db, first.id, {
        title: 'First renamed',
        steps: [{ text: 'Still first' }],
      });

      await expect(listRoutines(db)).resolves.toEqual([
        expect.objectContaining({ id: first.id, title: 'First renamed' }),
        expect.objectContaining({ id: second.id, title: 'Second' }),
      ]);
    });
  });

  describe('reorderRoutines', () => {
    it('restores every position when SQLite rejects a later write in a reorder', async () => {
      const db = await setup();
      const alpha = await createRoutine(db, { title: 'Alpha', steps: [{ text: 'Keep alpha' }] });
      const bravo = await createRoutine(db, { title: 'Bravo', steps: [{ text: 'Keep bravo' }] });
      const before = await db.getAllAsync('SELECT * FROM routines ORDER BY id');
      await db.execAsync(`CREATE TRIGGER fail_second_position
        BEFORE UPDATE OF library_position ON routines
        WHEN NEW.library_position = 1
        BEGIN SELECT RAISE(ABORT, 'simulated disk write failure'); END;`);

      await expect(reorderRoutines(db, [alpha.id, bravo.id]))
        .rejects.toMatchObject({ message: 'simulated disk write failure' });

      expect(await db.getAllAsync('SELECT * FROM routines ORDER BY id')).toEqual(before);
      expect((await exportAllRoutines(db)).map(({ title }) => title)).toEqual(['Bravo', 'Alpha']);
    });

    it('reorders a sparse library without colliding with existing unique positions', async () => {
      const db = await setup();
      const alpha = await createRoutine(db, { title: 'Alpha', steps: [] });
      const bravo = await createRoutine(db, { title: 'Bravo', steps: [] });
      await db.runAsync('UPDATE routines SET library_position = 500 WHERE id = ?', alpha.id);
      await reorderRoutines(db, [alpha.id, bravo.id]);
      expect(await db.getAllAsync('SELECT id, library_position FROM routines ORDER BY library_position'))
        .toEqual([{ id: alpha.id, library_position: 0 }, { id: bravo.id, library_position: 1 }]);
    });

    it('persists the complete requested order', async () => {
      const db = await setup();
      const alpha = await createRoutine(db, { title: 'Alpha', steps: [] });
      const bravo = await createRoutine(db, { title: 'Bravo', steps: [] });
      const charlie = await createRoutine(db, { title: 'Charlie', steps: [] });

      await reorderRoutines(db, [bravo.id, alpha.id, charlie.id]);

      await expect(listRoutines(db)).resolves.toEqual([
        expect.objectContaining({ id: bravo.id }),
        expect.objectContaining({ id: alpha.id }),
        expect.objectContaining({ id: charlie.id }),
      ]);
    });

    it.each([
      ['omits a routine', (ids: string[]) => ids.slice(0, 1)],
      ['duplicates a routine', (ids: string[]) => [ids[0], ids[0]]],
      ['contains an unknown routine', (ids: string[]) => [ids[0], 'missing']],
    ])('rejects an order that %s without changing the library', async (_name, arrange) => {
      const db = await setup();
      const first = await createRoutine(db, { title: 'First', steps: [] });
      const second = await createRoutine(db, { title: 'Second', steps: [] });
      const before = (await listRoutines(db)).map((routine) => routine.id);

      await expect(
        reorderRoutines(db, arrange([first.id, second.id])),
      ).rejects.toThrow(/complete library order/i);

      await expect(listRoutines(db)).resolves.toEqual(
        before.map((id) => expect.objectContaining({ id })),
      );
    });
  });

  describe('exportAllRoutines', () => {
    it('returns all stored routines as input-shaped data with items in position order', async () => {
      const db = await setup();
      const ts = 1_700_000_000_000;
      await db.runAsync(
        `INSERT INTO routines
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-b',
        'Beta',
        ts,
        ts,
        1,
      );
      await db.runAsync(
        `INSERT INTO routines
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-a',
        'Alpha',
        ts,
        ts,
        0,
      );
      await db.runAsync(
        `INSERT INTO routines
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-c',
        'Later',
        ts + 1,
        ts + 1,
        2,
      );
      await db.runAsync(
        'INSERT INTO steps (id, routine_id, position, text) VALUES (?, ?, ?, ?)',
        'item-b-1',
        'id-b',
        1,
        'second',
      );
      await db.runAsync(
        'INSERT INTO steps (id, routine_id, position, text) VALUES (?, ?, ?, ?)',
        'item-b-0',
        'id-b',
        0,
        'first',
      );

      await expect(exportAllRoutines(db)).resolves.toEqual([
        { title: 'Alpha', colorKey: expect.any(String), steps: [] },
        {
          title: 'Beta',
          colorKey: expect.any(String),
          steps: [{ text: 'first', timerSeconds: null }, { text: 'second', timerSeconds: null }],
        },
        { title: 'Later', colorKey: expect.any(String), steps: [] },
      ]);
    });

    it('returns an empty array when there are no routines', async () => {
      const db = await setup();
      await expect(exportAllRoutines(db)).resolves.toEqual([]);
    });

    it('exports routines in their manually arranged order', async () => {
      const db = await setup();
      const alpha = await createRoutine(db, { title: 'Alpha', steps: [] });
      const bravo = await createRoutine(db, { title: 'Bravo', steps: [] });
      await reorderRoutines(db, [alpha.id, bravo.id]);

      await expect(exportAllRoutines(db)).resolves.toEqual([
        { title: 'Alpha', colorKey: expect.any(String), steps: [] },
        { title: 'Bravo', colorKey: expect.any(String), steps: [] },
      ]);
    });
  });

  describe('importRoutines', () => {
    it('rolls back earlier routines and steps when SQLite rejects a later imported step', async () => {
      const db = await setup();
      await createRoutine(db, { title: 'Existing', steps: [{ text: 'Keep this' }] });
      const before = await exportAllRoutines(db);
      await db.execAsync(`CREATE TRIGGER fail_import_step
        BEFORE INSERT ON steps WHEN NEW.text = 'Reject this step'
        BEGIN SELECT RAISE(ABORT, 'simulated disk write failure'); END;`);

      await expect(importRoutines(db, [
        { title: 'First import', steps: [{ text: 'Earlier write' }] },
        { title: 'Second import', steps: [{ text: 'Reject this step' }] },
      ])).rejects.toMatchObject({ message: 'simulated disk write failure' });

      expect(await exportAllRoutines(db)).toEqual(before);
      expect(await db.getAllAsync('SELECT text FROM steps')).toEqual([{ text: 'Keep this' }]);
    });

    it('inserts every routine and returns the count', async () => {
      const db = await setup();

      await expect(
        importRoutines(db, [
          { title: 'Morning', steps: [{ text: 'Wake up' }] },
          { title: 'Evening', steps: [] },
        ]),
      ).resolves.toBe(2);

      await expect(listRoutines(db)).resolves.toHaveLength(2);
    });

    it('adds imported routines without replacing existing routines', async () => {
      const db = await setup();
      const existing = await createRoutine(db, {
        title: 'Existing',
        steps: [{ text: 'Keep' }],
      });

      await importRoutines(db, [
        { title: 'Imported 1', steps: [] },
        { title: 'Imported 2', steps: [] },
      ]);

      const list = await listRoutines(db);
      expect(list).toHaveLength(3);
      expect(await getRoutine(db, existing.id)).toMatchObject({
        id: existing.id,
        title: 'Existing',
      });
    });

    it('appends imported routines after existing routines in backup order', async () => {
      const db = await setup();
      const existing = await createRoutine(db, {
        title: 'Existing',
        steps: [],
      });

      await importRoutines(db, [
        { title: 'Zulu import', steps: [] },
        { title: 'Alpha import', steps: [] },
      ]);

      await expect(listRoutines(db)).resolves.toEqual([
        expect.objectContaining({ id: existing.id, title: 'Existing' }),
        expect.objectContaining({ title: 'Zulu import' }),
        expect.objectContaining({ title: 'Alpha import' }),
      ]);
    });

    it('preserves item text and order', async () => {
      const db = await setup();

      await importRoutines(db, [
        {
          title: 'Ordered',
          steps: [{ text: 'one' }, { text: 'two' }, { text: 'three' }],
        },
      ]);

      const [summary] = await listRoutines(db);
      const loaded = await getRoutine(db, summary.id);
      expect(loaded?.steps.map((item) => item.text)).toEqual(['one', 'two', 'three']);
      expect(loaded?.steps.map((item) => item.order)).toEqual([0, 1, 2]);
    });

    it('imports an exported library into a fresh database', async () => {
      const source = await setup();
      await createRoutine(source, {
        title: 'Trip',
        steps: [{ text: 'Pack' }, { text: 'Drive' }],
      });
      await createRoutine(source, { title: 'Draft', steps: [] });
      const exported = await exportAllRoutines(source);

      const target = await setup();
      await importRoutines(target, exported);

      const summaries = await listRoutines(target);
      const loaded = await Promise.all(
        summaries.map(async (summary) => {
          const routine = await getRoutine(target, summary.id);
          return {
            title: routine?.title,
            steps: routine?.steps.map((item) => ({ text: item.text, order: item.order })),
          };
        }),
      );
      expect(loaded.sort((a, b) => String(a.title).localeCompare(String(b.title)))).toEqual([
        { title: 'Draft', steps: [] },
        {
          title: 'Trip',
          steps: [
            { text: 'Pack', order: 0 },
            { text: 'Drive', order: 1 },
          ],
        },
      ]);
    });

    it('rolls back the whole import when one routine is invalid', async () => {
      const db = await setup();

      await expect(
        importRoutines(db, [
          { title: 'Valid', steps: [{ text: 'Keep' }] },
          { title: '   ', steps: [] },
        ]),
      ).rejects.toThrow(/Title is required/);

      await expect(listRoutines(db)).resolves.toEqual([]);
    });
  });

  describe('updateRoutine', () => {
    it('replaces title and items and rewrites positions contiguously', async () => {
      const db = await setup();
      const created = await createRoutine(db, {
        title: 'Trip',
        steps: [{ text: 'Pack' }, { text: 'Drive' }, { text: 'Arrive' }],
      });

      const updated = await updateRoutine(db, created.id, {
        title: 'Trip 2',
        steps: [{ text: 'Drive' }, { text: 'Arrive' }],
      });

      expect(updated.title).toBe('Trip 2');
      expect(updated.steps).toHaveLength(2);
      expect(updated.steps.map((i) => ({ text: i.text, order: i.order }))).toEqual([
        { text: 'Drive', order: 0 },
        { text: 'Arrive', order: 1 },
      ]);
    });

    it('reorders items by writing them in the new order with contiguous positions', async () => {
      const db = await setup();
      const created = await createRoutine(db, {
        title: 'Mix',
        steps: [{ text: 'one' }, { text: 'two' }, { text: 'three' }],
      });

      const reordered = await updateRoutine(db, created.id, {
        title: 'Mix',
        steps: [{ text: 'three' }, { text: 'one' }, { text: 'two' }],
      });

      expect(reordered.steps.map((i) => i.text)).toEqual(['three', 'one', 'two']);
      expect(reordered.steps.map((i) => i.order)).toEqual([0, 1, 2]);
    });

    it('trims title and item text on update', async () => {
      const db = await setup();
      const created = await createRoutine(db, {
        title: 'Original',
        steps: [{ text: 'first' }],
      });

      const updated = await updateRoutine(db, created.id, {
        title: '  Renamed  ',
        steps: [{ text: '  trimmed  ' }],
      });

      expect(updated.title).toBe('Renamed');
      expect(updated.steps[0].text).toBe('trimmed');
    });

    it('rejects an empty title', async () => {
      const db = await setup();
      const created = await createRoutine(db, { title: 'Keep', steps: [] });
      await expect(
        updateRoutine(db, created.id, { title: '   ', steps: [] }),
      ).rejects.toThrow(/Title is required/);
    });

    it('throws when the routine does not exist', async () => {
      const db = await setup();
      await expect(
        updateRoutine(db, 'missing', { title: 'x', steps: [] }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('deleteRoutine', () => {
    it('removes the routine and cascades to its items', async () => {
      const db = await setup();
      const created = await createRoutine(db, {
        title: 'Doomed',
        steps: [{ text: 'a' }, { text: 'b' }],
      });

      await deleteRoutine(db, created.id);

      expect(await getRoutine(db, created.id)).toBeNull();
      const remaining = await db.getAllAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM steps WHERE routine_id = ?',
        created.id,
      );
      expect(remaining[0].count).toBe(0);
    });

    it('is a no-op when the routine does not exist', async () => {
      const db = await setup();
      await expect(deleteRoutine(db, 'missing')).resolves.toBeNull();
    });
  });
  describe('timers, colors and undoing a delete', () => {
    it('saves each step timer and the routine color, and reads them back', async () => {
      const db = await setup();
      const created = await createRoutine(db, {
        title: 'Stretch',
        colorKey: 'teal-1',
        steps: [{ text: 'Neck rolls', timerSeconds: 30 }, { text: 'Breathe' }],
      });

      const loaded = await getRoutine(db, created.id);
      expect(loaded?.colorKey).toBe('teal-1');
      expect(loaded?.steps.map(({ text, timerSeconds }) => ({ text, timerSeconds }))).toEqual([
        { text: 'Neck rolls', timerSeconds: 30 },
        { text: 'Breathe', timerSeconds: null },
      ]);
    });

    it('changes timers and the color when a routine is updated', async () => {
      const db = await setup();
      const created = await createRoutine(db, {
        title: 'Stretch',
        colorKey: 'teal-1',
        steps: [{ text: 'Neck rolls', timerSeconds: 30 }],
      });

      await updateRoutine(db, created.id, {
        title: 'Stretch',
        colorKey: 'violet-2',
        steps: [{ text: 'Neck rolls', timerSeconds: null }, { text: 'Plank', timerSeconds: 3600 }],
      });

      const loaded = await getRoutine(db, created.id);
      expect(loaded?.colorKey).toBe('violet-2');
      expect(loaded?.steps.map((step) => step.timerSeconds)).toEqual([null, 3600]);
    });

    it('rejects timers that are not whole seconds from one second to an hour', async () => {
      const db = await setup();
      for (const timerSeconds of [0, 3601, 1.5, -1]) {
        await expect(
          createRoutine(db, { title: 'Bad', steps: [{ text: 'Step', timerSeconds }] }),
        ).rejects.toThrow(/timer/i);
      }
      expect(await listRoutines(db)).toEqual([]);
    });

    it('gives a routine created without a color one the first six routines are not using', async () => {
      const db = await setup();
      const firstSix = ['pink-1', 'pink-2', 'red-1', 'orange-1', 'orange-2', 'taupe'];
      for (const colorKey of firstSix) {
        await createRoutine(db, { title: colorKey, colorKey, steps: [] });
      }

      const created = await createRoutine(db, { title: 'New', steps: [] });

      expect(isRoutineColorKey(created.colorKey)).toBe(true);
      expect(firstSix).not.toContain(created.colorKey);
      expect((await getRoutine(db, created.id))?.colorKey).toBe(created.colorKey);
    });

    it('lists each routine with its color', async () => {
      const db = await setup();
      await createRoutine(db, { title: 'One', colorKey: 'slate', steps: [{ text: 'a' }] });

      expect(await listRoutines(db)).toEqual([
        expect.objectContaining({ title: 'One', colorKey: 'slate' }),
      ]);
    });

    it('exports timers and colors with each routine', async () => {
      const db = await setup();
      await createRoutine(db, {
        title: 'Stretch',
        colorKey: 'lime-1',
        steps: [{ text: 'Plank', timerSeconds: 45 }, { text: 'Rest' }],
      });

      expect(await exportAllRoutines(db)).toEqual([
        {
          title: 'Stretch',
          colorKey: 'lime-1',
          steps: [
            { text: 'Plank', timerSeconds: 45 },
            { text: 'Rest', timerSeconds: null },
          ],
        },
      ]);
    });

    it('restores a deleted routine in its old place with the same identity, steps, timers and color', async () => {
      const db = await setup();
      const third = await createRoutine(db, { title: 'Third', steps: [] });
      const doomed = await createRoutine(db, {
        title: 'Doomed',
        colorKey: 'amber-2',
        steps: [{ text: 'Plank', timerSeconds: 60 }, { text: 'Rest' }],
      });
      const first = await createRoutine(db, { title: 'First', steps: [] });
      const before = await getRoutine(db, doomed.id);

      const deleted = await deleteRoutine(db, doomed.id);
      expect((await listRoutines(db)).map((routine) => routine.title)).toEqual(['First', 'Third']);

      await restoreRoutine(db, deleted!);

      expect((await listRoutines(db)).map((routine) => routine.id)).toEqual([first.id, doomed.id, third.id]);
      expect(await getRoutine(db, doomed.id)).toEqual(before);
    });

    it('restores into the same place after the library is reordered in the meantime', async () => {
      const db = await setup();
      const c = await createRoutine(db, { title: 'C', steps: [] });
      const b = await createRoutine(db, { title: 'B', steps: [] });
      const a = await createRoutine(db, { title: 'A', steps: [] });
      const deleted = await deleteRoutine(db, b.id);

      await reorderRoutines(db, [c.id, a.id]);
      await restoreRoutine(db, deleted!);

      expect((await listRoutines(db)).map((routine) => routine.title)).toEqual(['C', 'B', 'A']);
    });
  });
});
