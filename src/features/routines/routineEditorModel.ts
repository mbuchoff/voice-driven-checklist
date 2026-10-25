import { v4 as uuidv4 } from 'uuid';

import { moveItem } from './reorder';
import type { Routine, RoutineInput } from './types';

export type EditorStep = {
  localId: string;
  text: string;
  timerSeconds: number | null;
  /** Added in this visit and never left with words yet. */
  fresh: boolean;
};

/** A swiped-away step's place, showing "Step deleted · UNDO". */
export type DeletedStepRow = {
  kind: 'deleted';
  localId: string;
  step: EditorStep;
};

export type EditorRow = ({ kind: 'step' } & EditorStep) | DeletedStepRow;

export type EditorState = {
  isNew: boolean;
  title: string;
  colorKey: string;
  rows: EditorRow[];
  /** The step open for typing, if any. */
  openId: string | null;
  /** The open step's words when it was opened, to give back if emptied. */
  openedText: string;
};

export function createEditorState({
  routine,
  colorKey,
}: {
  routine?: Routine;
  colorKey?: string;
}): EditorState {
  return {
    isNew: !routine,
    title: routine?.title ?? '',
    colorKey: routine?.colorKey ?? colorKey ?? '',
    rows: (routine?.steps ?? []).map((step) => ({
      kind: 'step',
      localId: uuidv4(),
      text: step.text,
      timerSeconds: step.timerSeconds,
      fresh: false,
    })),
    openId: null,
    openedText: '',
  };
}

export function realSteps(state: EditorState): EditorStep[] {
  return state.rows.filter((row): row is { kind: 'step' } & EditorStep => row.kind === 'step');
}

function findStep(state: EditorState, id: string) {
  return realSteps(state).find((step) => step.localId === id);
}

function updateStep(
  state: EditorState,
  id: string,
  update: (step: EditorStep) => Partial<EditorStep>,
): EditorState {
  return {
    ...state,
    rows: state.rows.map((row) =>
      row.kind === 'step' && row.localId === id ? { ...row, ...update(row) } : row,
    ),
  };
}

function removeRow(state: EditorState, id: string): EditorState {
  return { ...state, rows: state.rows.filter((row) => row.localId !== id) };
}

/**
 * Closes the open step. A new step left blank goes away (with any timer set
 * on it); a new step with words becomes an ordinary step; an existing step
 * left empty gets back the words it had when opened.
 */
export function leaveOpenStep(state: EditorState): EditorState {
  const id = state.openId;
  if (!id) return state;
  const closed = { ...state, openId: null, openedText: '' };
  const step = findStep(state, id);
  if (!step) return closed;
  const hasWords = step.text.trim().length > 0;
  if (step.fresh) {
    return hasWords
      ? updateStep(closed, id, () => ({ fresh: false }))
      : removeRow(closed, id);
  }
  if (hasWords) return closed;
  return state.openedText.trim()
    ? updateStep(closed, id, () => ({ text: state.openedText }))
    : removeRow(closed, id);
}

export function openStep(state: EditorState, id: string): EditorState {
  if (state.openId === id) return state;
  const left = leaveOpenStep(state);
  const step = findStep(left, id);
  if (!step) return left;
  return { ...left, openId: id, openedText: step.text };
}

/** Appends a blank step at the end and opens it. */
export function addStep(state: EditorState, newId: string): EditorState {
  const left = leaveOpenStep(state);
  return {
    ...left,
    rows: [...left.rows, { kind: 'step', localId: newId, text: '', timerSeconds: null, fresh: true }],
    openId: newId,
    openedText: '',
  };
}

/**
 * Enter never adds a line break: it closes an existing step, keeps a new step
 * with words and opens another new step, and removes a blank new step.
 */
export function pressEnter(state: EditorState, newId: string): EditorState {
  const step = state.openId ? findStep(state, state.openId) : undefined;
  if (step?.fresh && step.text.trim()) return addStep(state, newId);
  return leaveOpenStep(state);
}

export function setStepText(state: EditorState, id: string, text: string): EditorState {
  return updateStep(state, id, () => ({ text }));
}

export function setStepTimer(state: EditorState, id: string, timerSeconds: number | null): EditorState {
  return updateStep(state, id, () => ({ timerSeconds }));
}

/** The name wraps on the card, but stays one line: pasted line breaks become spaces. */
export function setTitle(state: EditorState, title: string): EditorState {
  return { ...state, title: title.replace(/\s*[\r\n]+\s*/g, ' ') };
}

export function setColor(state: EditorState, colorKey: string): EditorState {
  return { ...state, colorKey };
}

/** Swipe-delete: the step's place becomes an undo row. */
export function deleteStep(state: EditorState, id: string): EditorState {
  const closed = state.openId === id ? { ...state, openId: null, openedText: '' } : state;
  return {
    ...closed,
    rows: closed.rows.map((row) =>
      row.kind === 'step' && row.localId === id
        ? { kind: 'deleted', localId: id, step: { ...row, fresh: false } }
        : row,
    ),
  };
}

export function undoDeleteStep(state: EditorState, id: string): EditorState {
  return {
    ...state,
    rows: state.rows.map((row) =>
      row.kind === 'deleted' && row.localId === id ? { kind: 'step', ...row.step } : row,
    ),
  };
}

export function expireDeletedStep(state: EditorState, id: string): EditorState {
  return {
    ...state,
    rows: state.rows.filter((row) => !(row.kind === 'deleted' && row.localId === id)),
  };
}

/**
 * Moves a step from one position to another, counting real steps only. Undo
 * rows stay where they are, so UNDO still puts a step back in its place.
 */
export function moveStep(state: EditorState, from: number, to: number): EditorState {
  const steps = moveItem(realSteps(state), from, to);
  let next = 0;
  return {
    ...state,
    rows: state.rows.map((row) => (row.kind === 'deleted' ? row : { kind: 'step' as const, ...steps[next++] })),
  };
}

function hasWords(step: EditorStep) {
  return step.text.trim().length > 0;
}

/** Steps shown in "N steps": a new step counts once it has words. */
export function countedSteps(state: EditorState): EditorStep[] {
  return realSteps(state).filter((step) => !step.fresh || hasWords(step));
}

export function countedStepCount(state: EditorState): number {
  return countedSteps(state).length;
}

export function timedTotal(state: EditorState): number {
  return countedSteps(state).reduce((sum, step) => sum + (step.timerSeconds ?? 0), 0);
}

export function canSave(state: EditorState): boolean {
  if (!state.title.trim()) return false;
  return !state.isNew || realSteps(state).some(hasWords);
}

/** What saving would store: trimmed words and timers, steps without words dropped. */
export function routineInput(state: EditorState): RoutineInput {
  return {
    title: state.title.trim(),
    colorKey: state.colorKey,
    steps: realSteps(state)
      .filter(hasWords)
      .map((step) => ({ text: step.text.trim(), timerSeconds: step.timerSeconds })),
  };
}

export function editorSnapshot(state: EditorState): string {
  return JSON.stringify(routineInput(state));
}

/** True when saving would change what's stored. */
export function isDirty(state: EditorState, savedSnapshot: string): boolean {
  return editorSnapshot(state) !== savedSnapshot;
}
