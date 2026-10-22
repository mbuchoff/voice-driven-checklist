export type RoutineRunSnapshot = {
  routineId: string;
  routineTitle: string;
  steps: { id: string; text: string; order: number; timerSeconds?: number | null }[];
};

export type RunStatus = 'idle' | 'speaking' | 'listening' | 'manual' | 'completed';

export type RoutineRunState = {
  status: RunStatus;
  snapshot: RoutineRunSnapshot | null;
  currentStepIndex: number;
  voiceControlAvailable: boolean;
  spokenPlaybackAvailable: boolean;
  latestRecognizedPhrase: string;
  /**
   * Increments every time the current item should be re-presented (initial
   * mount, NEXT-advance, REPEAT, PREVIOUS, RESTART). The run-screen
   * orchestrator depends on this so that REPEAT can re-trigger speech even
   * when the index and status are unchanged.
   */
  playbackTick: number;
  /**
   * Increments each time the run arrives at a step (start, next, previous,
   * restart), but not on a repeat, so a step's countdown starts on arrival
   * and a repeat leaves it running.
   */
  arrival: number;
};

export type RunAction =
  | { type: 'NEXT' }
  | { type: 'REPEAT' }
  | { type: 'PREVIOUS' }
  | { type: 'RESTART' }
  | { type: 'RECOGNIZED_PHRASE'; phrase: string }
  | { type: 'VOICE_UNAVAILABLE' }
  | { type: 'PLAYBACK_UNAVAILABLE' }
  | { type: 'PLAYBACK_FINISHED' }
  | { type: 'DISCARD_RUN' };
