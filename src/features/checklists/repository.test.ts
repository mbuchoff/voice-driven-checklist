import {
  createChecklist,
  deleteChecklist,
  exportAllChecklists,
  getChecklist,
  importChecklists,
  listChecklists,
  reorderChecklists,
  updateChecklist,
} from './repository';
import { runMigrations } from '@/src/db/migrations';
import type { Database } from '@/src/db/database';
import { createTestDatabase } from '@/src/test/createTestDatabase';

async function setup(): Promise<Database> {
  const db = createTestDatabase();
  await runMigrations(db);
  return db;
}

describe('checklist repository', () => {
  describe('createChecklist', () => {
    it('persists a checklist with items in order', async () => {
      const db = await setup();
      const created = await createChecklist(db, {
        title: 'Morning routine',
        items: [{ text: 'Wake up' }, { text: 'Brush teeth' }],
      });

      expect(created.title).toBe('Morning routine');
      expect(created.items).toHaveLength(2);
      expect(created.items[0]).toMatchObject({ text: 'Wake up', order: 0 });
      expect(created.items[1]).toMatchObject({ text: 'Brush teeth', order: 1 });
      expect(created.id).toEqual(expect.any(String));
      expect(created.items[0].id).toEqual(expect.any(String));
    });

    it('trims the title before storage', async () => {
      const db = await setup();
      const created = await createChecklist(db, {
        title: '  Surrounded title  ',
        items: [{ text: '  An item  ' }],
      });

      expect(created.title).toBe('Surrounded title');
      expect(created.items[0].text).toBe('An item');
    });

    it('rejects an empty title', async () => {
      const db = await setup();
      await expect(
        createChecklist(db, { title: '   ', items: [] }),
      ).rejects.toThrow(/Title is required/);
    });

    it('rejects an item whose text is empty after trimming', async () => {
      const db = await setup();
      await expect(
        createChecklist(db, { title: 'OK', items: [{ text: '   ' }] }),
      ).rejects.toThrow(/Item text is required/);
    });

    it('allows creating a checklist with zero items as a draft', async () => {
      const db = await setup();
      const created = await createChecklist(db, { title: 'Draft', items: [] });
      expect(created.items).toEqual([]);
    });

    it('places each newly saved routine first', async () => {
      const db = await setup();
      const first = await createChecklist(db, { title: 'First', items: [] });
      const second = await createChecklist(db, { title: 'Second', items: [] });

      await expect(listChecklists(db)).resolves.toEqual([
        expect.objectContaining({ id: second.id }),
        expect.objectContaining({ id: first.id }),
      ]);
    });
  });

  describe('getChecklist', () => {
    it('returns the persisted checklist with items in position order', async () => {
      const db = await setup();
      const created = await createChecklist(db, {
        title: 'Errands',
        items: [{ text: 'Bank' }, { text: 'Pharmacy' }, { text: 'Groceries' }],
      });

      const loaded = await getChecklist(db, created.id);
      expect(loaded?.title).toBe('Errands');
      expect(loaded?.items.map((i) => i.text)).toEqual(['Bank', 'Pharmacy', 'Groceries']);
      expect(loaded?.items.map((i) => i.order)).toEqual([0, 1, 2]);
    });

    it('returns null when the checklist does not exist', async () => {
      const db = await setup();
      expect(await getChecklist(db, 'missing')).toBeNull();
    });
  });

  describe('listChecklists', () => {
    it('returns an empty array when there are no checklists', async () => {
      const db = await setup();
      expect(await listChecklists(db)).toEqual([]);
    });

    it('orders checklists by their explicit library positions', async () => {
      const db = await setup();
      await db.runAsync(
        `INSERT INTO checklists
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-old',
        'Old',
        1000,
        1000,
        2,
      );
      await db.runAsync(
        `INSERT INTO checklists
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-mid',
        'Mid',
        2000,
        2000,
        1,
      );
      await db.runAsync(
        `INSERT INTO checklists
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-new',
        'New',
        3000,
        3000,
        0,
      );

      const list = await listChecklists(db);
      expect(list.map((row) => row.id)).toEqual(['id-new', 'id-mid', 'id-old']);
    });

    it('does not let title sorting override explicit positions', async () => {
      const db = await setup();
      const ts = 1_700_000_000_000;
      await db.runAsync(
        `INSERT INTO checklists
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-c',
        'Charlie',
        ts,
        ts,
        0,
      );
      await db.runAsync(
        `INSERT INTO checklists
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-a',
        'Alpha',
        ts,
        ts,
        1,
      );
      await db.runAsync(
        `INSERT INTO checklists
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-b',
        'Bravo',
        ts,
        ts,
        2,
      );

      const list = await listChecklists(db);
      expect(list.map((row) => row.title)).toEqual(['Charlie', 'Alpha', 'Bravo']);
    });

    it('returns the item count for each checklist', async () => {
      const db = await setup();
      const a = await createChecklist(db, { title: 'A', items: [{ text: '1' }] });
      const b = await createChecklist(db, {
        title: 'B',
        items: [{ text: '1' }, { text: '2' }, { text: '3' }],
      });
      const c = await createChecklist(db, { title: 'C', items: [] });

      const list = await listChecklists(db);
      const byId = new Map(list.map((row) => [row.id, row.itemCount]));
      expect(byId.get(a.id)).toBe(1);
      expect(byId.get(b.id)).toBe(3);
      expect(byId.get(c.id)).toBe(0);
    });

    it('returns every item in step order without another repository read', async () => {
      const db = await setup();
      await createChecklist(db, {
        title: 'Morning',
        items: [
          { text: 'Open blinds' },
          { text: 'Drink water' },
          { text: 'Make bed' },
        ],
      });

      await expect(listChecklists(db)).resolves.toEqual([
        expect.objectContaining({
          title: 'Morning',
          items: [
            { text: 'Open blinds' },
            { text: 'Drink water' },
            { text: 'Make bed' },
          ],
        }),
      ]);
    });

    it('keeps a manually arranged routine in place after editing it', async () => {
      const db = await setup();
      const first = await createChecklist(db, { title: 'First', items: [] });
      const second = await createChecklist(db, { title: 'Second', items: [] });
      await reorderChecklists(db, [first.id, second.id]);

      await updateChecklist(db, first.id, {
        title: 'First renamed',
        items: [{ text: 'Still first' }],
      });

      await expect(listChecklists(db)).resolves.toEqual([
        expect.objectContaining({ id: first.id, title: 'First renamed' }),
        expect.objectContaining({ id: second.id, title: 'Second' }),
      ]);
    });
  });

  describe('reorderChecklists', () => {
    it('restores every position when SQLite rejects a later write in a reorder', async () => {
      const db = await setup();
      const alpha = await createChecklist(db, { title: 'Alpha', items: [{ text: 'Keep alpha' }] });
      const bravo = await createChecklist(db, { title: 'Bravo', items: [{ text: 'Keep bravo' }] });
      const before = await db.getAllAsync('SELECT * FROM checklists ORDER BY id');
      await db.execAsync(`CREATE TRIGGER fail_second_position
        BEFORE UPDATE OF library_position ON checklists
        WHEN NEW.library_position = 1
        BEGIN SELECT RAISE(ABORT, 'simulated disk write failure'); END;`);

      await expect(reorderChecklists(db, [alpha.id, bravo.id]))
        .rejects.toMatchObject({ message: 'simulated disk write failure' });

      expect(await db.getAllAsync('SELECT * FROM checklists ORDER BY id')).toEqual(before);
      expect((await exportAllChecklists(db)).map(({ title }) => title)).toEqual(['Bravo', 'Alpha']);
    });

    it('reorders a sparse library without colliding with existing unique positions', async () => {
      const db = await setup();
      const alpha = await createChecklist(db, { title: 'Alpha', items: [] });
      const bravo = await createChecklist(db, { title: 'Bravo', items: [] });
      await db.runAsync('UPDATE checklists SET library_position = 500 WHERE id = ?', alpha.id);
      await reorderChecklists(db, [alpha.id, bravo.id]);
      expect(await db.getAllAsync('SELECT id, library_position FROM checklists ORDER BY library_position'))
        .toEqual([{ id: alpha.id, library_position: 0 }, { id: bravo.id, library_position: 1 }]);
    });

    it('persists the complete requested order', async () => {
      const db = await setup();
      const alpha = await createChecklist(db, { title: 'Alpha', items: [] });
      const bravo = await createChecklist(db, { title: 'Bravo', items: [] });
      const charlie = await createChecklist(db, { title: 'Charlie', items: [] });

      await reorderChecklists(db, [bravo.id, alpha.id, charlie.id]);

      await expect(listChecklists(db)).resolves.toEqual([
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
      const first = await createChecklist(db, { title: 'First', items: [] });
      const second = await createChecklist(db, { title: 'Second', items: [] });
      const before = (await listChecklists(db)).map((checklist) => checklist.id);

      await expect(
        reorderChecklists(db, arrange([first.id, second.id])),
      ).rejects.toThrow(/complete library order/i);

      await expect(listChecklists(db)).resolves.toEqual(
        before.map((id) => expect.objectContaining({ id })),
      );
    });
  });

  describe('exportAllChecklists', () => {
    it('returns all stored checklists as input-shaped data with items in position order', async () => {
      const db = await setup();
      const ts = 1_700_000_000_000;
      await db.runAsync(
        `INSERT INTO checklists
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-b',
        'Beta',
        ts,
        ts,
        1,
      );
      await db.runAsync(
        `INSERT INTO checklists
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-a',
        'Alpha',
        ts,
        ts,
        0,
      );
      await db.runAsync(
        `INSERT INTO checklists
           (id, title, created_at, updated_at, library_position)
         VALUES (?, ?, ?, ?, ?)`,
        'id-c',
        'Later',
        ts + 1,
        ts + 1,
        2,
      );
      await db.runAsync(
        'INSERT INTO checklist_items (id, checklist_id, position, text) VALUES (?, ?, ?, ?)',
        'item-b-1',
        'id-b',
        1,
        'second',
      );
      await db.runAsync(
        'INSERT INTO checklist_items (id, checklist_id, position, text) VALUES (?, ?, ?, ?)',
        'item-b-0',
        'id-b',
        0,
        'first',
      );

      await expect(exportAllChecklists(db)).resolves.toEqual([
        { title: 'Alpha', items: [] },
        { title: 'Beta', items: [{ text: 'first' }, { text: 'second' }] },
        { title: 'Later', items: [] },
      ]);
    });

    it('returns an empty array when there are no checklists', async () => {
      const db = await setup();
      await expect(exportAllChecklists(db)).resolves.toEqual([]);
    });

    it('exports routines in their manually arranged order', async () => {
      const db = await setup();
      const alpha = await createChecklist(db, { title: 'Alpha', items: [] });
      const bravo = await createChecklist(db, { title: 'Bravo', items: [] });
      await reorderChecklists(db, [alpha.id, bravo.id]);

      await expect(exportAllChecklists(db)).resolves.toEqual([
        { title: 'Alpha', items: [] },
        { title: 'Bravo', items: [] },
      ]);
    });
  });

  describe('importChecklists', () => {
    it('rolls back earlier routines and steps when SQLite rejects a later imported step', async () => {
      const db = await setup();
      await createChecklist(db, { title: 'Existing', items: [{ text: 'Keep this' }] });
      const before = await exportAllChecklists(db);
      await db.execAsync(`CREATE TRIGGER fail_import_step
        BEFORE INSERT ON checklist_items WHEN NEW.text = 'Reject this step'
        BEGIN SELECT RAISE(ABORT, 'simulated disk write failure'); END;`);

      await expect(importChecklists(db, [
        { title: 'First import', items: [{ text: 'Earlier write' }] },
        { title: 'Second import', items: [{ text: 'Reject this step' }] },
      ])).rejects.toMatchObject({ message: 'simulated disk write failure' });

      expect(await exportAllChecklists(db)).toEqual(before);
      expect(await db.getAllAsync('SELECT text FROM checklist_items')).toEqual([{ text: 'Keep this' }]);
    });

    it('inserts every checklist and returns the count', async () => {
      const db = await setup();

      await expect(
        importChecklists(db, [
          { title: 'Morning', items: [{ text: 'Wake up' }] },
          { title: 'Evening', items: [] },
        ]),
      ).resolves.toBe(2);

      await expect(listChecklists(db)).resolves.toHaveLength(2);
    });

    it('adds imported checklists without replacing existing checklists', async () => {
      const db = await setup();
      const existing = await createChecklist(db, {
        title: 'Existing',
        items: [{ text: 'Keep' }],
      });

      await importChecklists(db, [
        { title: 'Imported 1', items: [] },
        { title: 'Imported 2', items: [] },
      ]);

      const list = await listChecklists(db);
      expect(list).toHaveLength(3);
      expect(await getChecklist(db, existing.id)).toMatchObject({
        id: existing.id,
        title: 'Existing',
      });
    });

    it('appends imported routines after existing routines in backup order', async () => {
      const db = await setup();
      const existing = await createChecklist(db, {
        title: 'Existing',
        items: [],
      });

      await importChecklists(db, [
        { title: 'Zulu import', items: [] },
        { title: 'Alpha import', items: [] },
      ]);

      await expect(listChecklists(db)).resolves.toEqual([
        expect.objectContaining({ id: existing.id, title: 'Existing' }),
        expect.objectContaining({ title: 'Zulu import' }),
        expect.objectContaining({ title: 'Alpha import' }),
      ]);
    });

    it('preserves item text and order', async () => {
      const db = await setup();

      await importChecklists(db, [
        {
          title: 'Ordered',
          items: [{ text: 'one' }, { text: 'two' }, { text: 'three' }],
        },
      ]);

      const [summary] = await listChecklists(db);
      const loaded = await getChecklist(db, summary.id);
      expect(loaded?.items.map((item) => item.text)).toEqual(['one', 'two', 'three']);
      expect(loaded?.items.map((item) => item.order)).toEqual([0, 1, 2]);
    });

    it('imports an exported library into a fresh database', async () => {
      const source = await setup();
      await createChecklist(source, {
        title: 'Trip',
        items: [{ text: 'Pack' }, { text: 'Drive' }],
      });
      await createChecklist(source, { title: 'Draft', items: [] });
      const exported = await exportAllChecklists(source);

      const target = await setup();
      await importChecklists(target, exported);

      const summaries = await listChecklists(target);
      const loaded = await Promise.all(
        summaries.map(async (summary) => {
          const checklist = await getChecklist(target, summary.id);
          return {
            title: checklist?.title,
            items: checklist?.items.map((item) => ({ text: item.text, order: item.order })),
          };
        }),
      );
      expect(loaded.sort((a, b) => String(a.title).localeCompare(String(b.title)))).toEqual([
        { title: 'Draft', items: [] },
        {
          title: 'Trip',
          items: [
            { text: 'Pack', order: 0 },
            { text: 'Drive', order: 1 },
          ],
        },
      ]);
    });

    it('rolls back the whole import when one checklist is invalid', async () => {
      const db = await setup();

      await expect(
        importChecklists(db, [
          { title: 'Valid', items: [{ text: 'Keep' }] },
          { title: '   ', items: [] },
        ]),
      ).rejects.toThrow(/Title is required/);

      await expect(listChecklists(db)).resolves.toEqual([]);
    });
  });

  describe('updateChecklist', () => {
    it('replaces title and items and rewrites positions contiguously', async () => {
      const db = await setup();
      const created = await createChecklist(db, {
        title: 'Trip',
        items: [{ text: 'Pack' }, { text: 'Drive' }, { text: 'Arrive' }],
      });

      const updated = await updateChecklist(db, created.id, {
        title: 'Trip 2',
        items: [{ text: 'Drive' }, { text: 'Arrive' }],
      });

      expect(updated.title).toBe('Trip 2');
      expect(updated.items).toHaveLength(2);
      expect(updated.items.map((i) => ({ text: i.text, order: i.order }))).toEqual([
        { text: 'Drive', order: 0 },
        { text: 'Arrive', order: 1 },
      ]);
    });

    it('reorders items by writing them in the new order with contiguous positions', async () => {
      const db = await setup();
      const created = await createChecklist(db, {
        title: 'Mix',
        items: [{ text: 'one' }, { text: 'two' }, { text: 'three' }],
      });

      const reordered = await updateChecklist(db, created.id, {
        title: 'Mix',
        items: [{ text: 'three' }, { text: 'one' }, { text: 'two' }],
      });

      expect(reordered.items.map((i) => i.text)).toEqual(['three', 'one', 'two']);
      expect(reordered.items.map((i) => i.order)).toEqual([0, 1, 2]);
    });

    it('trims title and item text on update', async () => {
      const db = await setup();
      const created = await createChecklist(db, {
        title: 'Original',
        items: [{ text: 'first' }],
      });

      const updated = await updateChecklist(db, created.id, {
        title: '  Renamed  ',
        items: [{ text: '  trimmed  ' }],
      });

      expect(updated.title).toBe('Renamed');
      expect(updated.items[0].text).toBe('trimmed');
    });

    it('rejects an empty title', async () => {
      const db = await setup();
      const created = await createChecklist(db, { title: 'Keep', items: [] });
      await expect(
        updateChecklist(db, created.id, { title: '   ', items: [] }),
      ).rejects.toThrow(/Title is required/);
    });

    it('throws when the checklist does not exist', async () => {
      const db = await setup();
      await expect(
        updateChecklist(db, 'missing', { title: 'x', items: [] }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('deleteChecklist', () => {
    it('removes the checklist and cascades to its items', async () => {
      const db = await setup();
      const created = await createChecklist(db, {
        title: 'Doomed',
        items: [{ text: 'a' }, { text: 'b' }],
      });

      await deleteChecklist(db, created.id);

      expect(await getChecklist(db, created.id)).toBeNull();
      const remaining = await db.getAllAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM checklist_items WHERE checklist_id = ?',
        created.id,
      );
      expect(remaining[0].count).toBe(0);
    });

    it('is a no-op when the checklist does not exist', async () => {
      const db = await setup();
      await expect(deleteChecklist(db, 'missing')).resolves.toBeUndefined();
    });
  });
});
