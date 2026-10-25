import { initialRunState, runReducer } from './runReducer';
import type { RoutineRunSnapshot, RoutineRunState } from './types';

const snapshot: RoutineRunSnapshot = {
  routineId: 'cl-1',
  routineTitle: 'Demo',
  steps: [
    { id: 'i1', text: 'Item one', order: 0, timerSeconds: null },
    { id: 'i2', text: 'Item two', order: 1, timerSeconds: null },
    { id: 'i3', text: 'Item three', order: 2, timerSeconds: null },
  ],
};

function start(
  overrides: Partial<{
    voiceControlAvailable: boolean;
    spokenPlaybackAvailable: boolean;
  }> = {},
): RoutineRunState {
  return initialRunState(snapshot, {
    voiceControlAvailable: overrides.voiceControlAvailable ?? true,
    spokenPlaybackAvailable: overrides.spokenPlaybackAvailable ?? true,
  });
}

const next = (state: RoutineRunState) => runReducer(state, { type: 'NEXT', arrival: state.arrival });
const previous = (state: RoutineRunState) => runReducer(state, { type: 'PREVIOUS', arrival: state.arrival });

describe('initialRunState', () => {
  it('starts in speaking when both speech paths are available', () => {
    const state = start();
    expect(state.status).toBe('speaking');
    expect(state.currentStepIndex).toBe(0);
    expect(state.snapshot).toBe(snapshot);
    expect(state.latestRecognizedPhrase).toBe('');
  });

  it('starts in listening when only voice recognition is available', () => {
    const state = start({ spokenPlaybackAvailable: false });
    expect(state.status).toBe('listening');
  });

  it('starts in manual when neither speech path is available', () => {
    const state = start({ voiceControlAvailable: false, spokenPlaybackAvailable: false });
    expect(state.status).toBe('manual');
  });
});

describe('runReducer NEXT', () => {
  it('advances to the next item and re-enters speaking when playback is available', () => {
    const state = next(start());
    expect(state.currentStepIndex).toBe(1);
    expect(state.status).toBe('speaking');
  });

  it('clears the latest recognized phrase when advancing', () => {
    const phrasing = next({ ...start({ spokenPlaybackAvailable: false }), latestRecognizedPhrase: 'next' });
    expect(phrasing.latestRecognizedPhrase).toBe('');
  });

  it('transitions to listening when playback is unavailable but voice is available', () => {
    const state = next(start({ spokenPlaybackAvailable: false }));
    expect(state.status).toBe('listening');
  });

  it('transitions to manual when neither speech path is available', () => {
    const state = next(start({ voiceControlAvailable: false, spokenPlaybackAvailable: false }));
    expect(state.status).toBe('manual');
  });

  it('completes the run when called on the final item', () => {
    let state = start();
    state = next(state); // -> 1
    state = next(state); // -> 2
    state = next(state); // -> completed
    expect(state.status).toBe('completed');
    expect(state.currentStepIndex).toBe(2);
    expect(state.latestRecognizedPhrase).toBe('');
  });

  it('is a no-op once the run is completed', () => {
    let state = start();
    for (let i = 0; i < snapshot.steps.length; i++) state = next(state);
    const completed = state;
    expect(next(completed)).toBe(completed);
  });
});

describe('runReducer REPEAT', () => {
  it('keeps the same index and re-enters speaking when playback is available', () => {
    const state = runReducer({ ...start(), currentStepIndex: 1 }, { type: 'REPEAT' });
    expect(state.currentStepIndex).toBe(1);
    expect(state.status).toBe('speaking');
  });

  it('transitions to listening when playback is unavailable but voice is available', () => {
    const state = runReducer(
      { ...start({ spokenPlaybackAvailable: false }), status: 'listening' },
      { type: 'REPEAT' },
    );
    expect(state.status).toBe('listening');
  });

  it('clears the latest recognized phrase', () => {
    const state = runReducer(
      { ...start(), latestRecognizedPhrase: 'repeat' },
      { type: 'REPEAT' },
    );
    expect(state.latestRecognizedPhrase).toBe('');
  });

  it('is a no-op when completed', () => {
    const completed = { ...start(), status: 'completed' as const };
    expect(runReducer(completed, { type: 'REPEAT' })).toBe(completed);
  });
});

describe('runReducer PREVIOUS', () => {
  it('moves back one item and re-enters speaking', () => {
    const state = previous({ ...start(), currentStepIndex: 2 });
    expect(state.currentStepIndex).toBe(1);
    expect(state.status).toBe('speaking');
  });

  it('stays on the first item and re-enters speaking when already at index 0', () => {
    const state = previous({ ...start(), currentStepIndex: 0 });
    expect(state.currentStepIndex).toBe(0);
    expect(state.status).toBe('speaking');
  });

  it('is a no-op when completed', () => {
    const completed = { ...start(), status: 'completed' as const, currentStepIndex: 2 };
    expect(previous(completed)).toBe(completed);
  });
});

describe('runReducer RECOGNIZED_PHRASE', () => {
  it('updates the displayed phrase while listening', () => {
    const listening = { ...start({ spokenPlaybackAvailable: false }), status: 'listening' as const };
    const next = runReducer(listening, { type: 'RECOGNIZED_PHRASE', phrase: 'hello world' });
    expect(next.latestRecognizedPhrase).toBe('hello world');
  });

  it('is ignored while speaking', () => {
    const speaking = { ...start(), status: 'speaking' as const };
    const next = runReducer(speaking, { type: 'RECOGNIZED_PHRASE', phrase: 'next' });
    expect(next).toBe(speaking);
  });

  it('is ignored once the run is completed', () => {
    const completed = { ...start(), status: 'completed' as const };
    expect(runReducer(completed, { type: 'RECOGNIZED_PHRASE', phrase: 'restart please' })).toBe(
      completed,
    );
  });
});

describe('runReducer VOICE_UNAVAILABLE', () => {
  it('marks voice unavailable, clears the transcript, and falls back to manual when listening', () => {
    const listening = {
      ...start({ spokenPlaybackAvailable: false }),
      status: 'listening' as const,
      latestRecognizedPhrase: 'something',
    };
    const next = runReducer(listening, { type: 'VOICE_UNAVAILABLE' });
    expect(next.voiceControlAvailable).toBe(false);
    expect(next.status).toBe('manual');
    expect(next.latestRecognizedPhrase).toBe('');
  });

  it('does not change status when speaking, but still clears voice availability and transcript', () => {
    const speaking = { ...start(), status: 'speaking' as const, latestRecognizedPhrase: 'cached' };
    const next = runReducer(speaking, { type: 'VOICE_UNAVAILABLE' });
    expect(next.status).toBe('speaking');
    expect(next.voiceControlAvailable).toBe(false);
    expect(next.latestRecognizedPhrase).toBe('');
  });
});

describe('runReducer PLAYBACK_UNAVAILABLE', () => {
  it('falls back from speaking to listening when voice is available', () => {
    const speaking = { ...start(), status: 'speaking' as const };
    const next = runReducer(speaking, { type: 'PLAYBACK_UNAVAILABLE' });
    expect(next.spokenPlaybackAvailable).toBe(false);
    expect(next.status).toBe('listening');
  });

  it('falls back from speaking to manual when voice is unavailable', () => {
    const speaking = {
      ...start({ voiceControlAvailable: false }),
      status: 'speaking' as const,
    };
    const next = runReducer(speaking, { type: 'PLAYBACK_UNAVAILABLE' });
    expect(next.status).toBe('manual');
  });

  it('only updates the flag when not currently speaking', () => {
    const listening = { ...start({ spokenPlaybackAvailable: false }), status: 'listening' as const };
    const next = runReducer(listening, { type: 'PLAYBACK_UNAVAILABLE' });
    expect(next.status).toBe('listening');
    expect(next.spokenPlaybackAvailable).toBe(false);
  });
});

describe('runReducer PLAYBACK_FINISHED', () => {
  it('transitions speaking to listening when voice is available', () => {
    const speaking = { ...start(), status: 'speaking' as const };
    const next = runReducer(speaking, { type: 'PLAYBACK_FINISHED' });
    expect(next.status).toBe('listening');
  });

  it('transitions speaking to manual when voice is unavailable', () => {
    const speaking = {
      ...start({ voiceControlAvailable: false }),
      status: 'speaking' as const,
    };
    const next = runReducer(speaking, { type: 'PLAYBACK_FINISHED' });
    expect(next.status).toBe('manual');
  });

  it('is ignored when not currently speaking', () => {
    const listening = { ...start({ spokenPlaybackAvailable: false }), status: 'listening' as const };
    expect(runReducer(listening, { type: 'PLAYBACK_FINISHED' })).toBe(listening);
  });
});

describe('runReducer RESTART', () => {
  it('resets to the first item and re-enters speaking when invoked from completed', () => {
    const completed = { ...start(), status: 'completed' as const, currentStepIndex: 2 };
    const next = runReducer(completed, { type: 'RESTART' });
    expect(next.status).toBe('speaking');
    expect(next.currentStepIndex).toBe(0);
    expect(next.latestRecognizedPhrase).toBe('');
    expect(next.snapshot).toBe(snapshot);
  });

  it('is a no-op when the run is not completed', () => {
    const speaking = { ...start(), status: 'speaking' as const };
    expect(runReducer(speaking, { type: 'RESTART' })).toBe(speaking);
  });
});

describe('runReducer playbackTick', () => {
  it('bumps the tick on NEXT advance', () => {
    const state = start();
    expect(state.playbackTick).toBe(1);
    expect(next(state).playbackTick).toBe(2);
  });

  it('does not bump the tick when NEXT completes the run', () => {
    let state = { ...start(), currentStepIndex: 2 };
    const tickBefore = state.playbackTick;
    state = next(state);
    expect(state.status).toBe('completed');
    expect(state.playbackTick).toBe(tickBefore);
  });

  it('bumps the tick on REPEAT, PREVIOUS, and RESTART', () => {
    const state = start();
    expect(runReducer(state, { type: 'REPEAT' }).playbackTick).toBe(state.playbackTick + 1);
    expect(previous({ ...state, currentStepIndex: 1 }).playbackTick).toBe(
      state.playbackTick + 1,
    );
    const completed = { ...state, status: 'completed' as const, currentStepIndex: 2 };
    expect(runReducer(completed, { type: 'RESTART' }).playbackTick).toBe(
      completed.playbackTick + 1,
    );
  });

  it('does not bump the tick for non-presentation actions', () => {
    const listening = { ...start({ spokenPlaybackAvailable: false }), status: 'listening' as const };
    const tick = listening.playbackTick;
    expect(
      runReducer(listening, { type: 'RECOGNIZED_PHRASE', phrase: 'hello' }).playbackTick,
    ).toBe(tick);
    const speaking = { ...start(), status: 'speaking' as const };
    expect(runReducer(speaking, { type: 'PLAYBACK_FINISHED' }).playbackTick).toBe(speaking.playbackTick);
    expect(runReducer(speaking, { type: 'VOICE_UNAVAILABLE' }).playbackTick).toBe(speaking.playbackTick);
    expect(runReducer(speaking, { type: 'PLAYBACK_UNAVAILABLE' }).playbackTick).toBe(speaking.playbackTick);
  });
});

describe('runReducer DISCARD_RUN', () => {
  it('clears the snapshot, transcript, and resets status to idle', () => {
    const listening = {
      ...start({ spokenPlaybackAvailable: false }),
      status: 'listening' as const,
      currentStepIndex: 1,
      latestRecognizedPhrase: 'something',
    };
    const discarded = runReducer(listening, { type: 'DISCARD_RUN' });
    expect(discarded.status).toBe('idle');
    expect(discarded.snapshot).toBeNull();
    expect(discarded.currentStepIndex).toBe(0);
    expect(discarded.latestRecognizedPhrase).toBe('');
  });

  describe('arrivals', () => {
    it('counts arriving at a step by next, previous or restart, but not a repeat', () => {
      let state = initialRunState(snapshot, { voiceControlAvailable: true, spokenPlaybackAvailable: true });
      const first = state.arrival;

      state = runReducer(state, { type: 'REPEAT' });
      expect(state.arrival).toBe(first);

      state = next(state);
      expect(state.arrival).toBe(first + 1);
      state = previous(state);
      expect(state.arrival).toBe(first + 2);

      state = next(next(next(state)));
      expect(state.status).toBe('completed');
      const finished = state.arrival;
      state = runReducer(state, { type: 'RESTART' });
      expect(state.arrival).toBe(finished + 1);
    });

    it('moves on once from an arrival, ignoring a second next or previous meant for it', () => {
      const arrived = start();
      const moved = next(arrived);

      expect(runReducer(moved, { type: 'NEXT', arrival: arrived.arrival })).toBe(moved);
      expect(runReducer(moved, { type: 'PREVIOUS', arrival: arrived.arrival })).toBe(moved);
      expect(next(moved).currentStepIndex).toBe(2);
    });
  });
});
