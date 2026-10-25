import { v4 as uuidv4 } from 'uuid';

import { moveItem } from './reorder';
import type { RoutineColorKey } from './routineColors';
import { chipCandidates, initialStepper, pressStepper, type StepperState } from './timers';
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
  /** The step's height, which its place keeps. */
  height: number;
};

export type EditorRow = ({ kind: 'step' } & EditorStep) | DeletedStepRow;

export type EditorState = {
  isNew: boolean;
  title: string;
  colorKey: RoutineColorKey;
  rows: EditorRow[];
  /** The step open for typing, if any. */
  openId: string | null;
  /** The open step's words when it was opened, to give back if emptied. */
  openedText: string;
  /**
   * The open step's times, fixed when it opens so they don't change under
   * the finger; none while no step is open.
   */
  openCandidates: number[];
  /** The timer panel, open over the open step. */
  panel: TimerPanelSession | null;
};

export type TimerPanelSession = {
  stepId: string;
  /** The step's time when the panel opened. */
  openedValue: number | null;
  stepper: StepperState;
  /** Fixed while the panel is open. */
  quickPicks: number[];
};

/** A new routine starts with its color; an existing one with what's saved. */
export type EditorStart = { kind: 'new'; colorKey: RoutineColorKey } | { kind: 'edit'; routine: Routine };

export function createEditorState(start: EditorStart): EditorState {
  const routine = start.kind === 'edit' ? start.routine : null;
  return {
    isNew: !routine,
    title: routine?.title ?? '',
    colorKey: start.kind === 'edit' ? start.routine.colorKey : start.colorKey,
    rows: (routine?.steps ?? []).map((step) => ({
      kind: 'step',
      localId: uuidv4(),
      text: step.text,
      timerSeconds: step.timerSeconds,
      fresh: false,
    })),
    openId: null,
    openedText: '',
    openCandidates: [],
    panel: null,
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
  const closed = { ...state, openId: null, openedText: '', openCandidates: [], panel: null };
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

/** Opens a step for typing, with its times from `recent` (the lengths used most recently). */
export function openStep(state: EditorState, id: string, recent: readonly number[]): EditorState {
  if (state.openId === id) return state;
  const left = leaveOpenStep(state);
  const step = findStep(left, id);
  if (!step) return left;
  return { ...left, openId: id, openedText: step.text, openCandidates: chipCandidates(step.timerSeconds, recent) };
}

/** Appends a blank step at the end and opens it. */
export function addStep(state: EditorState, newId: string, recent: readonly number[]): EditorState {
  const left = leaveOpenStep(state);
  return {
    ...left,
    rows: [...left.rows, { kind: 'step', localId: newId, text: '', timerSeconds: null, fresh: true }],
    openId: newId,
    openedText: '',
    openCandidates: chipCandidates(null, recent),
  };
}

/** The open step's times again, its own time among them (back from the timer panel). */
export function refreshOpenCandidates(state: EditorState, recent: readonly number[]): EditorState {
  const step = state.openId ? findStep(state, state.openId) : undefined;
  return step ? { ...state, openCandidates: chipCandidates(step.timerSeconds, recent) } : state;
}

/**
 * Enter never adds a line break: it closes an existing step, keeps a new step
 * with words and opens another new step, and removes a blank new step.
 */
export function pressEnter(state: EditorState, newId: string, recent: readonly number[]): EditorState {
  const step = state.openId ? findStep(state, state.openId) : undefined;
  if (step?.fresh && step.text.trim()) return addStep(state, newId, recent);
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

export function setColor(state: EditorState, colorKey: RoutineColorKey): EditorState {
  return { ...state, colorKey };
}

/** Swipe-delete: the step's place, at its height, becomes an undo row. */
export function deleteStep(state: EditorState, id: string, height: number): EditorState {
  const closed = state.openId === id ? { ...state, openId: null, openedText: '', openCandidates: [] } : state;
  return {
    ...closed,
    rows: closed.rows.map((row) =>
      row.kind === 'step' && row.localId === id
        ? { kind: 'deleted', localId: id, step: { ...row, fresh: false }, height }
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

/** Every undo row goes at once (a drag starting). */
export function expireDeletedSteps(state: EditorState): EditorState {
  return state.rows.some((row) => row.kind === 'deleted')
    ? { ...state, rows: state.rows.filter((row) => row.kind === 'step') }
    : state;
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

// Each state is worked out once (the Save bar and ▶ both ask on every render).
const snapshots = new WeakMap<EditorState, string>();

export function editorSnapshot(state: EditorState): string {
  let snapshot = snapshots.get(state);
  if (snapshot === undefined) {
    snapshot = JSON.stringify(routineInput(state));
    snapshots.set(state, snapshot);
  }
  return snapshot;
}

/** True when saving would change what's stored. */
export function isDirty(state: EditorState, savedSnapshot: string): boolean {
  return editorSnapshot(state) !== savedSnapshot;
}

/** The Save bar shows for a new routine, or when saving would change what's stored. */
export function needsSave(state: EditorState, savedSnapshot: string): boolean {
  return state.isNew || isDirty(state, savedSnapshot);
}

/** ▶ runs the saved routine, so it shows only with nothing unsaved and a step with words. */
export function canRun(state: EditorState, savedSnapshot: string): boolean {
  return !state.isNew && !isDirty(state, savedSnapshot) && realSteps(state).some(hasWords);
}

/** The routine's name as shown: as typed, else `savedTitle`, else "Untitled routine". */
export function displayTitle(state: EditorState, savedTitle?: string): string {
  return state.title.trim() || savedTitle || 'Untitled routine';
}

/** The timer panel opens on step `id`, with a fresh stepper and its quick picks. */
export function openTimerPanel(state: EditorState, id: string, recent: readonly number[]): EditorState {
  const step = findStep(state, id);
  if (!step) return state;
  return {
    ...state,
    panel: {
      stepId: id,
      openedValue: step.timerSeconds,
      stepper: initialStepper(),
      quickPicks: chipCandidates(step.timerSeconds, recent),
    },
  };
}

/** One press of the panel's − or +. */
export function pressPanelStepper(state: EditorState, dir: -1 | 1): EditorState {
  const panel = state.panel;
  const step = panel ? findStep(state, panel.stepId) : undefined;
  if (!panel || !step) return state;
  const next = pressStepper(panel.stepper, step.timerSeconds, dir);
  return { ...setStepTimer(state, panel.stepId, next.value), panel: { ...panel, stepper: next.state } };
}

/**
 * A quick pick, or "No timer" (null): sets the step's time and starts the
 * stepper afresh. Picking the time the step already has does nothing.
 */
export function pickPanelTime(state: EditorState, seconds: number | null): EditorState {
  const panel = state.panel;
  const step = panel ? findStep(state, panel.stepId) : undefined;
  if (!panel || !step || seconds === step.timerSeconds) return state;
  return { ...setStepTimer(state, panel.stepId, seconds), panel: { ...panel, stepper: initialStepper() } };
}

/**
 * Done: back to typing in the step, with its times again (its new one
 * among them), and the time to remember as used, if it changed and isn't Off.
 */
export function closeTimerPanel(
  state: EditorState,
  recent: readonly number[],
): { state: EditorState; remember: number | null } {
  const panel = state.panel;
  if (!panel) return { state, remember: null };
  const value = findStep(state, panel.stepId)?.timerSeconds ?? null;
  return {
    state: refreshOpenCandidates({ ...state, panel: null }, recent),
    remember: value && value !== panel.openedValue ? value : null,
  };
}
