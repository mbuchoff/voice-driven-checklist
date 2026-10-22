export type Step = {
  id: string;
  text: string;
  order: number;
};

export type Routine = {
  id: string;
  title: string;
  steps: Step[];
};

export type LibraryRoutine = {
  id: string;
  title: string;
  steps: StepInput[];
};

export type RoutineInput = {
  title: string;
  steps: StepInput[];
};

export type StepInput = {
  text: string;
};
