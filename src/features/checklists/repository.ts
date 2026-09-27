import { v4 as uuidv4 } from 'uuid';

import type { Database, DatabaseQueries } from '@/src/db/database';

import type {
  Checklist,
  ChecklistInput,
  ChecklistItem,
  LibraryChecklist,
} from './types';
import { validateChecklistItemText, validateChecklistTitle } from './validation';

function trimTitle(title: string): string {
  const result = validateChecklistTitle(title);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function buildItems(inputs: ChecklistInput['items']): ChecklistItem[] {
  return inputs.map((input, order) => {
    const result = validateChecklistItemText(input.text);
    if (!result.ok) throw new Error(result.error);
    return { id: uuidv4(), text: result.value, order };
  });
}

async function insertItems(db: DatabaseQueries, checklistId: string, items: ChecklistItem[]): Promise<void> {
  for (const item of items) {
    await db.runAsync(
      'INSERT INTO checklist_items (id, checklist_id, position, text) VALUES (?, ?, ?, ?)',
      item.id,
      checklistId,
      item.order,
      item.text,
    );
  }
}

function prepareChecklist(input: ChecklistInput): Checklist {
  return {
    id: uuidv4(),
    title: trimTitle(input.title),
    items: buildItems(input.items),
  };
}

async function writeChecklist(
  db: DatabaseQueries,
  checklist: Checklist,
  libraryPosition: number,
): Promise<void> {
  const now = Date.now();

  await db.runAsync(
    `INSERT INTO checklists
       (id, title, created_at, updated_at, library_position)
     VALUES (?, ?, ?, ?, ?)`,
    checklist.id,
    checklist.title,
    now,
    now,
    libraryPosition,
  );
  await insertItems(db, checklist.id, checklist.items);
}

async function getLastLibraryPosition(db: DatabaseQueries): Promise<number> {
  const row = await db.getFirstAsync<{ position: number }>(
    `SELECT COALESCE(MAX(library_position), -1) AS position
     FROM checklists`,
  );
  return row?.position ?? -1;
}

async function makeRoomForFirstChecklist(db: DatabaseQueries): Promise<void> {
  // SQLite checks UNIQUE per row, so a direct +1 update can collide. Stage
  // above the occupied range, then shift back to leave exactly slot zero free.
  const lastPosition = await getLastLibraryPosition(db);
  if (lastPosition < 0) return;

  const offset = lastPosition + 2;
  await db.runAsync(
    'UPDATE checklists SET library_position = library_position + ?',
    offset,
  );
  await db.runAsync(
    'UPDATE checklists SET library_position = library_position - ?',
    offset - 1,
  );
}

export async function createChecklist(db: Database, input: ChecklistInput): Promise<Checklist> {
  const checklist = prepareChecklist(input);

  await db.withTransactionAsync(async (transaction) => {
    await makeRoomForFirstChecklist(transaction);
    await writeChecklist(transaction, checklist, 0);
  });

  return checklist;
}

export async function updateChecklist(
  db: Database,
  id: string,
  input: ChecklistInput,
): Promise<Checklist> {
  const title = trimTitle(input.title);
  const items = buildItems(input.items);
  const now = Date.now();

  await db.withTransactionAsync(async (transaction) => {
    const result = await transaction.runAsync(
      'UPDATE checklists SET title = ?, updated_at = ? WHERE id = ?',
      title,
      now,
      id,
    );
    if (result.changes === 0) {
      throw new Error(`Checklist not found: ${id}`);
    }
    await transaction.runAsync('DELETE FROM checklist_items WHERE checklist_id = ?', id);
    await insertItems(transaction, id, items);
  });

  return { id, title, items };
}

export async function deleteChecklist(db: Database, id: string): Promise<void> {
  await db.runAsync('DELETE FROM checklists WHERE id = ?', id);
}

export async function exportAllChecklists(db: Database): Promise<ChecklistInput[]> {
  return (await listChecklists(db)).map(({ title, items }) => ({ title, items }));
}

export async function importChecklists(
  db: Database,
  inputs: ChecklistInput[],
): Promise<number> {
  const prepared = inputs.map(prepareChecklist);

  await db.withTransactionAsync(async (transaction) => {
    const firstPosition = (await getLastLibraryPosition(transaction)) + 1;
    for (const [index, checklist] of prepared.entries()) {
      await writeChecklist(transaction, checklist, firstPosition + index);
    }
  });

  return prepared.length;
}

export async function getChecklist(db: Database, id: string): Promise<Checklist | null> {
  const row = await db.getFirstAsync<{ id: string; title: string }>(
    'SELECT id, title FROM checklists WHERE id = ?',
    id,
  );
  if (!row) return null;

  const itemRows = await db.getAllAsync<{ id: string; text: string; position: number }>(
    'SELECT id, text, position FROM checklist_items WHERE checklist_id = ? ORDER BY position ASC',
    id,
  );

  return {
    id: row.id,
    title: row.title,
    items: itemRows.map((r) => ({ id: r.id, text: r.text, order: r.position })),
  };
}

export async function listChecklists(db: Database): Promise<LibraryChecklist[]> {
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    item_text: string | null;
  }>(
    `SELECT
       c.id AS id,
       c.title AS title,
       ci.text AS item_text
     FROM checklists c
     LEFT JOIN checklist_items ci ON ci.checklist_id = c.id
     ORDER BY c.library_position ASC, ci.position ASC`,
  );

  const summaries: LibraryChecklist[] = [];
  let currentId: string | null = null;
  let current: LibraryChecklist | null = null;
  for (const row of rows) {
    if (row.id !== currentId) {
      currentId = row.id;
      current = {
        id: row.id,
        title: row.title,
        items: [],
      };
      summaries.push(current);
    }
    if (row.item_text != null && current) {
      current.items.push({ text: row.item_text });
    }
  }
  return summaries;
}

export async function reorderChecklists(
  db: Database,
  orderedIds: string[],
): Promise<void> {
  await db.withTransactionAsync(async (transaction) => {
    const rows = await transaction.getAllAsync<{ id: string }>(
      'SELECT id FROM checklists ORDER BY library_position ASC',
    );
    const existingIds = new Set(rows.map((row) => row.id));
    const requestedIds = new Set(orderedIds);
    if (
      orderedIds.length !== rows.length ||
      requestedIds.size !== orderedIds.length ||
      orderedIds.some((id) => !existingIds.has(id))
    ) {
      throw new Error('A complete library order is required.');
    }

    const lastPosition = await getLastLibraryPosition(transaction);
    // Keep staging disjoint from both current positions and final 0..n-1 slots.
    const offset = Math.max(1, lastPosition + orderedIds.length + 1);
    await transaction.runAsync(
      'UPDATE checklists SET library_position = library_position + ?',
      offset,
    );
    for (const [position, id] of orderedIds.entries()) {
      await transaction.runAsync(
        'UPDATE checklists SET library_position = ? WHERE id = ?',
        position,
        id,
      );
    }
  });
}
