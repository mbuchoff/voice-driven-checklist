import type {
  RoutineRunSnapshot,
  RoutineRunState,
  RunAction,
  RunStatus,
} from './types';

type CommandableState = RoutineRunState & { snapshot: RoutineRunSnapshot };

function statusForActiveStep(state: RoutineRunState): RunStatus {
  if (state.spokenPlaybackAvailable) return 'speaking';
  if (state.voiceControlAvailable) return 'listening';
  return 'manual';
}

/** The run is on a step: reading it, listening, or waiting for a tap. */
export function isRunActive(status: RunStatus): boolean {
  return status === 'speaking' || status === 'listening' || status === 'manual';
}

function canAcceptCommand(state: RoutineRunState): state is CommandableState {
  return isRunActive(state.status);
}

export function initialRunState(
  snapshot: RoutineRunSnapshot,
  options: { voiceControlAvailable: boolean; spokenPlaybackAvailable: boolean },
): RoutineRunState {
  const base: RoutineRunState = {
    status: 'idle',
    snapshot,
    currentStepIndex: 0,
    voiceControlAvailable: options.voiceControlAvailable,
    spokenPlaybackAvailable: options.spokenPlaybackAvailable,
    latestRecognizedPhrase: '',
    playbackTick: 1,
    arrival: 1,
  };
  return { ...base, status: statusForActiveStep(base) };
}

export function runReducer(state: RoutineRunState, action: RunAction): RoutineRunState {
  switch (action.type) {
    case 'NEXT': {
      if (!canAcceptCommand(state) || action.arrival !== state.arrival) return state;
      const lastIndex = state.snapshot.steps.length - 1;
      if (state.currentStepIndex >= lastIndex) {
        return { ...state, status: 'completed', latestRecognizedPhrase: '' };
      }
      return {
        ...state,
        currentStepIndex: state.currentStepIndex + 1,
        latestRecognizedPhrase: '',
        playbackTick: state.playbackTick + 1,
        arrival: state.arrival + 1,
        status: statusForActiveStep(state),
      };
    }

    case 'REPEAT': {
      if (!canAcceptCommand(state)) return state;
      return {
        ...state,
        latestRecognizedPhrase: '',
        playbackTick: state.playbackTick + 1,
        status: statusForActiveStep(state),
      };
    }

    case 'PREVIOUS': {
      if (!canAcceptCommand(state) || action.arrival !== state.arrival) return state;
      return {
        ...state,
        currentStepIndex: Math.max(0, state.currentStepIndex - 1),
        latestRecognizedPhrase: '',
        playbackTick: state.playbackTick + 1,
        arrival: state.arrival + 1,
        status: statusForActiveStep(state),
      };
    }

    case 'RESTART': {
      if (state.status !== 'completed') return state;
      return {
        ...state,
        currentStepIndex: 0,
        latestRecognizedPhrase: '',
        playbackTick: state.playbackTick + 1,
        arrival: state.arrival + 1,
        status: statusForActiveStep(state),
      };
    }

    case 'RECOGNIZED_PHRASE': {
      if (state.status !== 'listening') return state;
      return { ...state, latestRecognizedPhrase: action.phrase };
    }

    case 'VOICE_UNAVAILABLE': {
      return {
        ...state,
        voiceControlAvailable: false,
        latestRecognizedPhrase: '',
        status: state.status === 'listening' ? 'manual' : state.status,
      };
    }

    case 'PLAYBACK_UNAVAILABLE': {
      const status =
        state.status === 'speaking'
          ? state.voiceControlAvailable
            ? 'listening'
            : 'manual'
          : state.status;
      return { ...state, spokenPlaybackAvailable: false, status };
    }

    case 'PLAYBACK_FINISHED': {
      if (state.status !== 'speaking') return state;
      return { ...state, status: state.voiceControlAvailable ? 'listening' : 'manual' };
    }

    case 'DISCARD_RUN': {
      return {
        status: 'idle',
        snapshot: null,
        currentStepIndex: 0,
        voiceControlAvailable: state.voiceControlAvailable,
        spokenPlaybackAvailable: state.spokenPlaybackAvailable,
        latestRecognizedPhrase: '',
        playbackTick: 0,
        arrival: 0,
      };
    }
  }
}
