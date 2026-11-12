import { v4 as uuidv4 } from 'uuid';

import type { Database, DatabaseQueries } from '@/src/db/database';

import { pickRoutineColorKey, storedRoutineColorKey, type RoutineColorKey } from './routineColors';
import type {
  DeletedRoutine,
  LibraryRoutine,
  Routine,
  RoutineInput,
  Step,
  StepInput,
} from './types';
import {
  validateRoutineTitle,
  validateStepText,
  validateStepTimer,
} from './validation';

// A new routine's random color avoids the colors of this many routines at
// the top of the library, so neighboring cards differ.
const NEIGHBOR_COLORS_AVOIDED = 6;

function trimTitle(title: string): string {
  const result = validateRoutineTitle(title);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function buildSteps(inputs: RoutineInput['steps']): Step[] {
  return inputs.map((input, order) => {
    const text = validateStepText(input.text);
    if (!text.ok) throw new Error(text.error);
    const timer = validateStepTimer(input.timerSeconds);
    if (!timer.ok) throw new Error(timer.error);
    return { id: uuidv4(), text: text.value, order, timerSeconds: timer.value };
  });
}

async function insertSteps(db: DatabaseQueries, routineId: string, steps: Step[]): Promise<void> {
  for (const step of steps) {
    await db.runAsync(
      'INSERT INTO steps (id, routine_id, position, text, timer_seconds) VALUES (?, ?, ?, ?, ?)',
      step.id,
      routineId,
      step.order,
      step.text,
      step.timerSeconds,
    );
  }
}

async function neighborColors(db: DatabaseQueries): Promise<string[]> {
  const rows = await db.getAllAsync<{ color: string }>(
    'SELECT color FROM routines ORDER BY library_position ASC LIMIT ?',
    NEIGHBOR_COLORS_AVOIDED,
  );
  return rows.map((row) => row.color);
}

/** The color a new routine should get when it doesn't bring one. */
export async function newRoutineColorKey(db: Database): Promise<RoutineColorKey> {
  return pickRoutineColorKey(await neighborColors(db));
}

async function resolveColorKey(db: DatabaseQueries, colorKey: RoutineColorKey | undefined): Promise<RoutineColorKey> {
  return colorKey ?? pickRoutineColorKey(await neighborColors(db));
}

async function writeRoutine(
  db: DatabaseQueries,
  routine: Routine,
  libraryPosition: number,
  createdAt = Date.now(),
  updatedAt = createdAt,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO routines
       (id, title, color, created_at, updated_at, library_position)
     VALUES (?, ?, ?, ?, ?, ?)`,
    routine.id,
    routine.title,
    routine.colorKey,
    createdAt,
    updatedAt,
    libraryPosition,
  );
  await insertSteps(db, routine.id, routine.steps);
}

async function getLastLibraryPosition(db: DatabaseQueries): Promise<number> {
  const row = await db.getFirstAsync<{ position: number }>(
    `SELECT COALESCE(MAX(library_position), -1) AS position
     FROM routines`,
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
    'UPDATE routines SET library_position = library_position + ?',
    offset,
  );
  await db.runAsync(
    'UPDATE routines SET library_position = library_position - ?',
    offset - 1,
  );
}

async function writeLibraryOrder(db: DatabaseQueries, orderedIds: string[]): Promise<void> {
  const lastPosition = await getLastLibraryPosition(db);
  // Keep staging disjoint from both current positions and final 0..n-1 slots.
  const offset = Math.max(1, lastPosition + orderedIds.length + 1);
  await db.runAsync(
    'UPDATE routines SET library_position = library_position + ?',
    offset,
  );
  for (const [position, id] of orderedIds.entries()) {
    await db.runAsync(
      'UPDATE routines SET library_position = ? WHERE id = ?',
      position,
      id,
    );
  }
}

async function orderedRoutineIds(db: DatabaseQueries): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM routines ORDER BY library_position ASC',
  );
  return rows.map((row) => row.id);
}

export async function createRoutine(db: Database, input: RoutineInput): Promise<Routine> {
  const title = trimTitle(input.title);
  const steps = buildSteps(input.steps);
  let routine: Routine | null = null;

  await db.withTransactionAsync(async (transaction) => {
    const created: Routine = {
      id: uuidv4(),
      title,
      colorKey: await resolveColorKey(transaction, input.colorKey),
      steps,
    };
    await makeRoomForFirstRoutine(transaction);
    await writeRoutine(transaction, created, 0);
    routine = created;
  });

  return routine!;
}

export async function updateRoutine(
  db: Database,
  id: string,
  input: RoutineInput,
): Promise<Routine> {
  const title = trimTitle(input.title);
  const steps = buildSteps(input.steps);
  const now = Date.now();
  // Set in the transaction, which throws if the routine is gone.
  let colorKey: RoutineColorKey | undefined;

  await db.withTransactionAsync(async (transaction) => {
    const current = await transaction.getFirstAsync<{ color: string }>(
      'SELECT color FROM routines WHERE id = ?',
      id,
    );
    if (!current) {
      throw new Error(`Routine not found: ${id}`);
    }
    colorKey = input.colorKey ?? storedRoutineColorKey(current.color);
    await transaction.runAsync(
      'UPDATE routines SET title = ?, color = ?, updated_at = ? WHERE id = ?',
      title,
      colorKey,
      now,
      id,
    );
    await transaction.runAsync('DELETE FROM steps WHERE routine_id = ?', id);
    await insertSteps(transaction, id, steps);
  });

  return { id, title, colorKey: colorKey!, steps };
}

/**
 * Deletes a routine and returns what's needed to restore it, or null when
 * there was no such routine.
 */
export async function deleteRoutine(db: Database, id: string): Promise<DeletedRoutine | null> {
  let deleted: DeletedRoutine | null = null;
  await db.withTransactionAsync(async (transaction) => {
    const row = await transaction.getFirstAsync<{ created_at: number; updated_at: number }>(
      'SELECT created_at, updated_at FROM routines WHERE id = ?',
      id,
    );
    const routine = await readRoutine(transaction, id);
    if (!row || !routine) return;
    const libraryIndex = (await orderedRoutineIds(transaction)).indexOf(id);
    await transaction.runAsync('DELETE FROM routines WHERE id = ?', id);
    deleted = {
      routine,
      libraryIndex,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
  return deleted;
}

/** Puts a deleted routine back at its old place in the library order. */
export async function restoreRoutine(db: Database, deleted: DeletedRoutine): Promise<void> {
  await db.withTransactionAsync(async (transaction) => {
    const order = await orderedRoutineIds(transaction);
    const index = Math.min(Math.max(0, deleted.libraryIndex), order.length);
    const lastPosition = await getLastLibraryPosition(transaction);
    await writeRoutine(
      transaction,
      deleted.routine,
      lastPosition + order.length + 2,
      deleted.createdAt,
      deleted.updatedAt,
    );
    order.splice(index, 0, deleted.routine.id);
    await writeLibraryOrder(transaction, order);
  });
}

async function readRoutine(db: DatabaseQueries, id: string): Promise<Routine | null> {
  const row = await db.getFirstAsync<{ id: string; title: string; color: string }>(
    'SELECT id, title, color FROM routines WHERE id = ?',
    id,
  );
  if (!row) return null;

  const stepRows = await db.getAllAsync<{
    id: string;
    text: string;
    position: number;
    timer_seconds: number | null;
  }>(
    'SELECT id, text, position, timer_seconds FROM steps WHERE routine_id = ? ORDER BY position ASC',
    id,
  );

  return {
    id: row.id,
    title: row.title,
    colorKey: storedRoutineColorKey(row.color),
    steps: stepRows.map((r) => ({
      id: r.id,
      text: r.text,
      order: r.position,
      timerSeconds: r.timer_seconds,
    })),
  };
}

export async function getRoutine(db: Database, id: string): Promise<Routine | null> {
  return readRoutine(db, id);
}

type LibraryRow = { id: string; title: string; colorKey: RoutineColorKey; steps: StepInput[] };

/** Every routine in library order, with its steps in order. */
async function readLibrary(db: Database): Promise<LibraryRow[]> {
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    color: string;
    text: string | null;
    timer_seconds: number | null;
  }>(
    `SELECT r.id AS id, r.title AS title, r.color AS color,
            s.text AS text, s.timer_seconds AS timer_seconds
     FROM routines r
     LEFT JOIN steps s ON s.routine_id = r.id
     ORDER BY r.library_position ASC, s.position ASC`,
  );
  const routines: LibraryRow[] = [];
  for (const row of rows) {
    if (routines[routines.length - 1]?.id !== row.id) {
      routines.push({ id: row.id, title: row.title, colorKey: storedRoutineColorKey(row.color), steps: [] });
    }
    if (row.text != null) {
      routines[routines.length - 1].steps.push({ text: row.text, timerSeconds: row.timer_seconds });
    }
  }
  return routines;
}

export async function exportAllRoutines(db: Database): Promise<RoutineInput[]> {
  return (await readLibrary(db)).map(({ title, colorKey, steps }) => ({ title, colorKey, steps }));
}

export async function importRoutines(
  db: Database,
  inputs: RoutineInput[],
): Promise<number> {
  const prepared = inputs.map((input) => ({
    title: trimTitle(input.title),
    colorKey: input.colorKey,
    steps: buildSteps(input.steps),
  }));

  await db.withTransactionAsync(async (transaction) => {
    const firstPosition = (await getLastLibraryPosition(transaction)) + 1;
    for (const [index, input] of prepared.entries()) {
      await writeRoutine(
        transaction,
        {
          id: uuidv4(),
          title: input.title,
          colorKey: await resolveColorKey(transaction, input.colorKey),
          steps: input.steps,
        },
        firstPosition + index,
      );
    }
  });

  return prepared.length;
}

export async function listRoutines(db: Database): Promise<LibraryRoutine[]> {
  return (await readLibrary(db)).map(({ id, title, colorKey, steps }) => ({
    id,
    title,
    colorKey,
    steps: steps.map(({ text }) => ({ text })),
  }));
}

export async function reorderRoutines(
  db: Database,
  orderedIds: string[],
): Promise<void> {
  await db.withTransactionAsync(async (transaction) => {
    const existing = await orderedRoutineIds(transaction);
    const existingIds = new Set(existing);
    const requestedIds = new Set(orderedIds);
    if (
      orderedIds.length !== existing.length ||
      requestedIds.size !== orderedIds.length ||
      orderedIds.some((id) => !existingIds.has(id))
    ) {
      throw new Error('A complete library order is required.');
    }
    await writeLibraryOrder(transaction, orderedIds);
  });
}
