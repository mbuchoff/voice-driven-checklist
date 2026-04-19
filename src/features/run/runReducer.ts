import type {
  ChecklistRunSnapshot,
  ChecklistRunState,
  RunAction,
  RunStatus,
} from './types';

type CommandableState = ChecklistRunState & { snapshot: ChecklistRunSnapshot };

function statusForActiveItem(state: ChecklistRunState): RunStatus {
  if (state.spokenPlaybackAvailable) return 'speaking';
  if (state.voiceControlAvailable) return 'listening';
  return 'manual';
}

function canAcceptCommand(state: ChecklistRunState): state is CommandableState {
  return state.status === 'speaking' || state.status === 'listening' || state.status === 'manual';
}

export function initialRunState(
  snapshot: ChecklistRunSnapshot,
  options: { voiceControlAvailable: boolean; spokenPlaybackAvailable: boolean },
): ChecklistRunState {
  const base: ChecklistRunState = {
    status: 'idle',
    snapshot,
    currentItemIndex: 0,
    voiceControlAvailable: options.voiceControlAvailable,
    spokenPlaybackAvailable: options.spokenPlaybackAvailable,
    latestRecognizedPhrase: '',
  };
  return { ...base, status: statusForActiveItem(base) };
}

export function runReducer(state: ChecklistRunState, action: RunAction): ChecklistRunState {
  switch (action.type) {
    case 'NEXT': {
      if (!canAcceptCommand(state)) return state;
      const lastIndex = state.snapshot.items.length - 1;
      if (state.currentItemIndex >= lastIndex) {
        return { ...state, status: 'completed', latestRecognizedPhrase: '' };
      }
      return {
        ...state,
        currentItemIndex: state.currentItemIndex + 1,
        latestRecognizedPhrase: '',
        status: statusForActiveItem(state),
      };
    }

    case 'REPEAT': {
      if (!canAcceptCommand(state)) return state;
      return { ...state, latestRecognizedPhrase: '', status: statusForActiveItem(state) };
    }

    case 'PREVIOUS': {
      if (!canAcceptCommand(state)) return state;
      return {
        ...state,
        currentItemIndex: Math.max(0, state.currentItemIndex - 1),
        latestRecognizedPhrase: '',
        status: statusForActiveItem(state),
      };
    }

    case 'RESTART': {
      if (state.status !== 'completed') return state;
      return {
        ...state,
        currentItemIndex: 0,
        latestRecognizedPhrase: '',
        status: statusForActiveItem(state),
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
        currentItemIndex: 0,
        voiceControlAvailable: state.voiceControlAvailable,
        spokenPlaybackAvailable: state.spokenPlaybackAvailable,
        latestRecognizedPhrase: '',
      };
    }
  }
}
