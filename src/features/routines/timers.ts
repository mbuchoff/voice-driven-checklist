import { formatTimerLong, formatTimerWords } from './timerFormat';
import { STEP_TIMER_MAX_SECONDS } from './validation';

/** How many time chips a step offers before ⋯. */
export const TIMER_CHIP_COUNT = 4;
/** Fill in the chips until there are four. */
export const TIMER_FILLERS = [30, 60, 120, 300];
/**
 * The panel's step sizes, coarsest first. Every finer size divides the
 * coarser ones (and 3600), so the time always stays a multiple of the
 * current step size and never needs snapping.
 */
export const STEPPER_LEVELS = [60, 15, 5, 1];

/**
 * A step's chip times, in priority order: its own time, the times used most
 * recently, then the fillers, four in all.
 */
export function chipCandidates(own: number | null, recent: readonly number[]): number[] {
  const times: number[] = [];
  const add = (time: number | null) => {
    if (time && !times.includes(time) && times.length < TIMER_CHIP_COUNT) times.push(time);
  };
  add(own);
  recent.forEach(add);
  TIMER_FILLERS.forEach(add);
  return times;
}

/**
 * Keeps chips on one line: while the chips, their gaps and ⋯ are wider than
 * `room`, the last candidate gives way (the first, a step's own time, always
 * stays). The rest show shortest first.
 */
export function fitChips(
  candidates: readonly number[],
  widthOf: (time: number) => number,
  room: number,
  gap: number,
  moreWidth: number,
): number[] {
  const kept = [...candidates];
  const widths = kept.map(widthOf);
  let used = widths.reduce((sum, width) => sum + width, 0)
    + gap * Math.max(0, kept.length - 1)
    + (moreWidth > 0 ? moreWidth + gap : 0);
  while (kept.length > 1 && used > room) {
    used -= widths.pop()! + gap;
    kept.pop();
  }
  return kept.sort((a, b) => a - b);
}

export type StepperState = {
  /** Index into STEPPER_LEVELS. */
  level: number;
  /** Direction of the last press: -1, 0 (none yet) or 1. */
  dir: -1 | 0 | 1;
};

/**
 * The stepper for a step's time: it moves by the smallest unit the time uses
 * (13s by 1s, 45s by 15s, 2 min by 1 min), or by a minute with no timer.
 */
export function initialStepper(value: number | null): StepperState {
  const level = value ? STEPPER_LEVELS.findIndex((size) => value % size === 0) : 0;
  return { level, dir: 0 };
}

function isReversing(state: StepperState, dir: -1 | 1): boolean {
  return state.dir !== 0 && dir !== state.dir;
}

/** The step size a press goes to: the next finer one on a change of direction. */
function levelAfter(state: StepperState, reversing: boolean): number {
  return reversing ? Math.min(state.level + 1, STEPPER_LEVELS.length - 1) : state.level;
}

/**
 * One press of − or +. Each change of direction drops to the next finer step
 * size; once a press in the same direction lands the time on a multiple of
 * the next coarser size, presses move by that size (14s + 1s = 15s, then
 * +5s). The value stays within 0 (Off, returned as null) and an hour.
 */
export function pressStepper(
  state: StepperState,
  value: number | null,
  dir: -1 | 1,
): { state: StepperState; value: number | null } {
  const reversing = isReversing(state, dir);
  const pressed = levelAfter(state, reversing);
  const before = value ?? 0;
  const next = Math.max(0, Math.min(STEP_TIMER_MAX_SECONDS, before + dir * STEPPER_LEVELS[pressed]));
  if (next === before) return { state, value };
  const climbs = !reversing && pressed > 0 && next % STEPPER_LEVELS[pressed - 1] === 0;
  return { state: { level: climbs ? pressed - 1 : pressed, dir }, value: next || null };
}

/** "−1 min", "+15s": what a press in `dir` would do next. */
export function stepCaption(state: StepperState, dir: -1 | 1): string {
  return `${dir < 0 ? '−' : '+'}${formatTimerLong(STEPPER_LEVELS[levelAfter(state, isReversing(state, dir))])}`;
}

/** "1 minute", "15 seconds", for the button's accessibility label. */
export function stepWords(state: StepperState, dir: -1 | 1): string {
  return formatTimerWords(STEPPER_LEVELS[levelAfter(state, isReversing(state, dir))]);
}
