export type ValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function validateChecklistTitle(input: string): ValidationResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Title is required.' };
  }
  return { ok: true, value: trimmed };
}

export function validateChecklistItemText(input: string): ValidationResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Item text is required.' };
  }
  return { ok: true, value: trimmed };
}
