import { v4 as uuidv4 } from 'uuid';

import type { Database, DatabaseQueries } from '@/src/db/database';

import type {
  Routine,
  RoutineInput,
  Step,
  LibraryRoutine,
} from './types';
import { validateStepText, validateRoutineTitle } from './validation';

function trimTitle(title: string): string {
  const result = validateRoutineTitle(title);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function buildSteps(inputs: RoutineInput['steps']): Step[] {
  return inputs.map((input, order) => {
    const result = validateStepText(input.text);
    if (!result.ok) throw new Error(result.error);
    return { id: uuidv4(), text: result.value, order };
  });
}

async function insertSteps(db: DatabaseQueries, routineId: string, steps: Step[]): Promise<void> {
  for (const step of steps) {
    await db.runAsync(
      'INSERT INTO checklist_items (id, checklist_id, position, text) VALUES (?, ?, ?, ?)',
      step.id,
      routineId,
      step.order,
      step.text,
    );
  }
}

function prepareRoutine(input: RoutineInput): Routine {
  return {
    id: uuidv4(),
    title: trimTitle(input.title),
    steps: buildSteps(input.steps),
  };
}

async function writeRoutine(
  db: DatabaseQueries,
  routine: Routine,
  libraryPosition: number,
): Promise<void> {
  const now = Date.now();

  await db.runAsync(
    `INSERT INTO checklists
       (id, title, created_at, updated_at, library_position)
     VALUES (?, ?, ?, ?, ?)`,
    routine.id,
    routine.title,
    now,
    now,
    libraryPosition,
  );
  await insertSteps(db, routine.id, routine.steps);
}

async function getLastLibraryPosition(db: DatabaseQueries): Promise<number> {
  const row = await db.getFirstAsync<{ position: number }>(
    `SELECT COALESCE(MAX(library_position), -1) AS position
     FROM checklists`,
  );
  return row?.position ?? -1;
}

async function makeRoomForFirstRoutine(db: DatabaseQueries): Promise<void> {
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

export async function createRoutine(db: Database, input: RoutineInput): Promise<Routine> {
  const routine = prepareRoutine(input);

  await db.withTransactionAsync(async (transaction) => {
    await makeRoomForFirstRoutine(transaction);
    await writeRoutine(transaction, routine, 0);
  });

  return routine;
}

export async function updateRoutine(
  db: Database,
  id: string,
  input: RoutineInput,
): Promise<Routine> {
  const title = trimTitle(input.title);
  const steps = buildSteps(input.steps);
  const now = Date.now();

  await db.withTransactionAsync(async (transaction) => {
    const result = await transaction.runAsync(
      'UPDATE checklists SET title = ?, updated_at = ? WHERE id = ?',
      title,
      now,
      id,
    );
    if (result.changes === 0) {
      throw new Error(`Routine not found: ${id}`);
    }
    await transaction.runAsync('DELETE FROM checklist_items WHERE checklist_id = ?', id);
    await insertSteps(transaction, id, steps);
  });

  return { id, title, steps };
}

export async function deleteRoutine(db: Database, id: string): Promise<void> {
  await db.runAsync('DELETE FROM checklists WHERE id = ?', id);
}

export async function exportAllRoutines(db: Database): Promise<RoutineInput[]> {
  return (await listRoutines(db)).map(({ title, steps }) => ({ title, steps }));
}

export async function importRoutines(
  db: Database,
  inputs: RoutineInput[],
): Promise<number> {
  const prepared = inputs.map(prepareRoutine);

  await db.withTransactionAsync(async (transaction) => {
    const firstPosition = (await getLastLibraryPosition(transaction)) + 1;
    for (const [index, routine] of prepared.entries()) {
      await writeRoutine(transaction, routine, firstPosition + index);
    }
  });

  return prepared.length;
}

export async function getRoutine(db: Database, id: string): Promise<Routine | null> {
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
    steps: itemRows.map((r) => ({ id: r.id, text: r.text, order: r.position })),
  };
}

export async function listRoutines(db: Database): Promise<LibraryRoutine[]> {
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

  const summaries: LibraryRoutine[] = [];
  let currentId: string | null = null;
  let current: LibraryRoutine | null = null;
  for (const row of rows) {
    if (row.id !== currentId) {
      currentId = row.id;
      current = {
        id: row.id,
        title: row.title,
        steps: [],
      };
      summaries.push(current);
    }
    if (row.item_text != null && current) {
      current.steps.push({ text: row.item_text });
    }
  }
  return summaries;
}

export async function reorderRoutines(
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
