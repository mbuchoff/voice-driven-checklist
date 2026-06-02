import {
  createChecklist,
  deleteChecklist,
  exportAllChecklists,
  getChecklist,
  importChecklists,
  listChecklists,
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

    it('orders checklists by updated_at DESC', async () => {
      const db = await setup();
      // Insert three checklists with explicit timestamps so the ordering is
      // independent of clock granularity.
      await db.runAsync(
        'INSERT INTO checklists (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
        'id-old',
        'Old',
        1000,
        1000,
      );
      await db.runAsync(
        'INSERT INTO checklists (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
        'id-mid',
        'Mid',
        2000,
        2000,
      );
      await db.runAsync(
        'INSERT INTO checklists (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
        'id-new',
        'New',
        3000,
        3000,
      );

      const list = await listChecklists(db);
      expect(list.map((row) => row.id)).toEqual(['id-new', 'id-mid', 'id-old']);
    });

    it('breaks updated_at ties using title ASC', async () => {
      const db = await setup();
      const ts = 1_700_000_000_000;
      await db.runAsync(
        'INSERT INTO checklists (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
        'id-c',
        'Charlie',
        ts,
        ts,
      );
      await db.runAsync(
        'INSERT INTO checklists (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
        'id-a',
        'Alpha',
        ts,
        ts,
      );
      await db.runAsync(
        'INSERT INTO checklists (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
        'id-b',
        'Bravo',
        ts,
        ts,
      );

      const list = await listChecklists(db);
      expect(list.map((row) => row.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
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
  });

  describe('exportAllChecklists', () => {
    it('returns all stored checklists as input-shaped data with items in position order', async () => {
      const db = await setup();
      const ts = 1_700_000_000_000;
      await db.runAsync(
        'INSERT INTO checklists (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
        'id-b',
        'Beta',
        ts,
        ts,
      );
      await db.runAsync(
        'INSERT INTO checklists (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
        'id-a',
        'Alpha',
        ts,
        ts,
      );
      await db.runAsync(
        'INSERT INTO checklists (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
        'id-c',
        'Later',
        ts + 1,
        ts + 1,
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
  });

  describe('importChecklists', () => {
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
