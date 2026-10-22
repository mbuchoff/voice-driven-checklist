export type ValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function validateRoutineTitle(input: string): ValidationResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Title is required.' };
  }
  return { ok: true, value: trimmed };
}

export function validateStepText(input: string): ValidationResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Step text is required.' };
  }
  return { ok: true, value: trimmed };
}

export const STEP_TIMER_MAX_SECONDS = 60 * 60;

export type TimerValidationResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

/** A step timer is whole seconds from 1 to an hour, or none. */
export function validateStepTimer(input: unknown): TimerValidationResult {
  if (input == null) return { ok: true, value: null };
  if (
    typeof input !== 'number' ||
    !Number.isInteger(input) ||
    input < 1 ||
    input > STEP_TIMER_MAX_SECONDS
  ) {
    return { ok: false, error: 'Step timers must be whole seconds from 1 second to 60 minutes.' };
  }
  return { ok: true, value: input };
}
