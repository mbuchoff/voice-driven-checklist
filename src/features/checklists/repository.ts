import { v4 as uuidv4 } from 'uuid';

import type { Database } from '@/src/db/database';

import type {
  Checklist,
  ChecklistInput,
  ChecklistItem,
  ChecklistSummary,
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

async function insertItems(db: Database, checklistId: string, items: ChecklistItem[]): Promise<void> {
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

export async function createChecklist(db: Database, input: ChecklistInput): Promise<Checklist> {
  const title = trimTitle(input.title);
  const items = buildItems(input.items);
  const id = uuidv4();
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO checklists (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
      id,
      title,
      now,
      now,
    );
    await insertItems(db, id, items);
  });

  return { id, title, items };
}

export async function updateChecklist(
  db: Database,
  id: string,
  input: ChecklistInput,
): Promise<Checklist> {
  const title = trimTitle(input.title);
  const items = buildItems(input.items);
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      'UPDATE checklists SET title = ?, updated_at = ? WHERE id = ?',
      title,
      now,
      id,
    );
    if (result.changes === 0) {
      throw new Error(`Checklist not found: ${id}`);
    }
    await db.runAsync('DELETE FROM checklist_items WHERE checklist_id = ?', id);
    await insertItems(db, id, items);
  });

  return { id, title, items };
}

export async function deleteChecklist(db: Database, id: string): Promise<void> {
  await db.runAsync('DELETE FROM checklists WHERE id = ?', id);
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

export async function listChecklists(db: Database): Promise<ChecklistSummary[]> {
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    updated_at: number;
    item_count: number;
  }>(
    `SELECT
       c.id AS id,
       c.title AS title,
       c.updated_at AS updated_at,
       COUNT(ci.id) AS item_count
     FROM checklists c
     LEFT JOIN checklist_items ci ON ci.checklist_id = c.id
     GROUP BY c.id
     ORDER BY c.updated_at DESC, c.title ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
    itemCount: row.item_count,
  }));
}
