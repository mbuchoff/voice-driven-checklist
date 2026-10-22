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
