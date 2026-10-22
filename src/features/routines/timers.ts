import { STEP_TIMER_MAX_SECONDS } from './validation';

/** How many time chips a step offers before ⋯. */
export const TIMER_CHIP_COUNT = 4;
/** Fill in the chips until there are four. */
export const TIMER_FILLERS = [30, 60, 120, 300];
/** The panel's step sizes, coarsest first. */
export const STEPPER_LEVELS = [60, 15, 5, 1];

/** Chips and clock labels: 30s, 1m, 1m 30s. */
export function formatTimerShort(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const rest = seconds % 60;
  return `${Math.floor(seconds / 60)}m${rest ? ` ${rest}s` : ''}`;
}

/** The timer panel's readout and the routine total: 1 min 30s. */
export function formatTimerLong(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const rest = seconds % 60;
  return `${Math.floor(seconds / 60)} min${rest ? ` ${rest}s` : ''}`;
}

/** Spoken by TalkBack: 1 minute 30 seconds. */
export function formatTimerWords(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const parts: string[] = [];
  if (minutes) parts.push(minutes === 1 ? '1 minute' : `${minutes} minutes`);
  if (rest || !minutes) parts.push(rest === 1 ? '1 second' : `${rest} seconds`);
  return parts.join(' ');
}

/** A running countdown: 1:45. */
export function formatCountdownClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** "14 steps · 10 min timed", "1 step", "No steps yet". */
export function countLine(stepCount: number, timedSeconds: number): string {
  if (stepCount === 0) return 'No steps yet';
  const steps = stepCount === 1 ? '1 step' : `${stepCount} steps`;
  return timedSeconds > 0 ? `${steps} · ${formatTimerLong(timedSeconds)} timed` : steps;
}

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

/** Using a time moves it to the front of the remembered ones, four at most. */
export function rememberTime(recent: readonly number[], seconds: number): number[] {
  return [seconds, ...recent.filter((time) => time !== seconds)].slice(0, TIMER_CHIP_COUNT);
}

export type StepperState = {
  /** Index into STEPPER_LEVELS. */
  level: number;
  /** Direction of the last press: -1, 0 (none yet) or 1. */
  dir: -1 | 0 | 1;
  /** Seconds moved in the current direction at the current level. */
  run: number;
};

export function initialStepper(): StepperState {
  return { level: 0, dir: 0, run: 0 };
}

function nextLevel(state: StepperState, dir: -1 | 1): number {
  const reversing = state.dir !== 0 && dir !== state.dir;
  return reversing ? Math.min(state.level + 1, STEPPER_LEVELS.length - 1) : state.level;
}

/**
 * One press of − or +. Each change of direction drops to the next finer step
 * size; moving a whole coarser step in one direction climbs back up. The
 * value stays within 0 (Off, returned as null) and an hour.
 */
export function pressStepper(
  state: StepperState,
  value: number | null,
  dir: -1 | 1,
): { state: StepperState; value: number | null } {
  const reversing = state.dir !== 0 && dir !== state.dir;
  const level = nextLevel(state, dir);
  const size = STEPPER_LEVELS[level];
  const before = value ?? 0;
  const next = Math.max(0, Math.min(STEP_TIMER_MAX_SECONDS, before + dir * size));
  if (next === before) return { state, value };
  let updated: StepperState = {
    level,
    dir,
    run: (reversing ? 0 : state.run) + size,
  };
  if (updated.level > 0 && updated.run >= STEPPER_LEVELS[updated.level - 1]) {
    updated = { ...updated, level: updated.level - 1, run: 0 };
  }
  return { state: updated, value: next || null };
}

/** "−1 min", "+15s": what a press in `dir` would do next. */
export function stepCaption(state: StepperState, dir: -1 | 1): string {
  return `${dir < 0 ? '−' : '+'}${formatTimerLong(STEPPER_LEVELS[nextLevel(state, dir)])}`;
}

/** "1 minute", "15 seconds", for the button's accessibility label. */
export function stepWords(state: StepperState, dir: -1 | 1): string {
  return formatTimerWords(STEPPER_LEVELS[nextLevel(state, dir)]);
}
