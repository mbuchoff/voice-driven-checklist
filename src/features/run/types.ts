export type ChecklistRunSnapshot = {
  checklistId: string;
  checklistTitle: string;
  items: { id: string; text: string; order: number }[];
};

export type RunStatus = 'idle' | 'speaking' | 'listening' | 'manual' | 'completed';

export type ChecklistRunState = {
  status: RunStatus;
  snapshot: ChecklistRunSnapshot | null;
  currentItemIndex: number;
  voiceControlAvailable: boolean;
  spokenPlaybackAvailable: boolean;
  latestRecognizedPhrase: string;
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
