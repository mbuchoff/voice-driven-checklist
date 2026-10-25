import { createContext, useContext, useState, type ReactNode } from 'react';

import type { DeletedRoutine } from './types';

/**
 * Deleting a routine in the editor hands it to the routines screen, which
 * offers UNDO for a few seconds. Only the latest deletion is offered.
 */
export type RoutineUndoStore = {
  offer(deleted: DeletedRoutine): void;
  /** Takes the routine waiting to be offered for undo, if any. */
  take(): DeletedRoutine | null;
};

export function createRoutineUndoStore(): RoutineUndoStore {
  let pending: DeletedRoutine | null = null;
  return {
    offer(deleted) {
      pending = deleted;
    },
    take() {
      const offered = pending;
      pending = null;
      return offered;
    },
  };
}

const RoutineUndoContext = createContext<RoutineUndoStore | null>(null);

/** Owns the hand-off; tests can pass their own `store`. */
export function RoutineUndoProvider({ store, children }: { store?: RoutineUndoStore; children: ReactNode }) {
  const [own] = useState(createRoutineUndoStore);
  return <RoutineUndoContext.Provider value={store ?? own}>{children}</RoutineUndoContext.Provider>;
}

export function useRoutineUndo(): RoutineUndoStore {
  const store = useContext(RoutineUndoContext);
  if (!store) throw new Error('useRoutineUndo must be used within RoutineUndoProvider.');
  return store;
}
