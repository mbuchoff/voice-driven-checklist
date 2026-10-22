import type { DeletedRoutine } from './types';

// Deleting a routine in the editor hands it to the routines screen, which
// offers UNDO for a few seconds. Only the latest deletion is offered.
let pending: DeletedRoutine | null = null;

export function offerRoutineUndo(deleted: DeletedRoutine) {
  pending = deleted;
}

/** Takes the routine waiting to be offered for undo, if any. */
export function takeRoutineUndo(): DeletedRoutine | null {
  const offered = pending;
  pending = null;
  return offered;
}
