import type { Routine } from '../routines/types';

import type { RoutineRunSnapshot } from './types';

export function createSnapshot(routine: Routine): RoutineRunSnapshot {
  return {
    routineId: routine.id,
    routineTitle: routine.title,
    steps: routine.steps.map((item) => ({ ...item })),
  };
}
