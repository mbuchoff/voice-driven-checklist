import type { RoutineColorKey } from './routineColors';

export type Step = {
  id: string;
  text: string;
  order: number;
  /** Whole seconds from 1 to 3600, or null for an untimed step. */
  timerSeconds: number | null;
};

export type Routine = {
  id: string;
  title: string;
  colorKey: RoutineColorKey;
  steps: Step[];
};

export type LibraryRoutine = {
  id: string;
  title: string;
  colorKey: RoutineColorKey;
  steps: { text: string }[];
};

export type RoutineInput = {
  title: string;
  /** Left out, a routine gets a new color (see pickRoutineColorKey). */
  colorKey?: RoutineColorKey;
  steps: StepInput[];
};

export type StepInput = {
  text: string;
  timerSeconds?: number | null;
};

/** Everything needed to put a deleted routine back exactly where it was. */
export type DeletedRoutine = {
  routine: Routine;
  /** Its index in the library order when it was deleted. */
  libraryIndex: number;
  createdAt: number;
  updatedAt: number;
};
