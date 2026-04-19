import { initialRunState, runReducer } from './runReducer';
import type { ChecklistRunSnapshot, ChecklistRunState } from './types';

const snapshot: ChecklistRunSnapshot = {
  checklistId: 'cl-1',
  checklistTitle: 'Demo',
  items: [
    { id: 'i1', text: 'Item one', order: 0 },
    { id: 'i2', text: 'Item two', order: 1 },
    { id: 'i3', text: 'Item three', order: 2 },
  ],
};

function start(
  overrides: Partial<{
    voiceControlAvailable: boolean;
    spokenPlaybackAvailable: boolean;
  }> = {},
): ChecklistRunState {
  return initialRunState(snapshot, {
    voiceControlAvailable: overrides.voiceControlAvailable ?? true,
    spokenPlaybackAvailable: overrides.spokenPlaybackAvailable ?? true,
  });
}

describe('initialRunState', () => {
  it('starts in speaking when both speech paths are available', () => {
    const state = start();
    expect(state.status).toBe('speaking');
    expect(state.currentItemIndex).toBe(0);
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
    const state = runReducer(start(), { type: 'NEXT' });
    expect(state.currentItemIndex).toBe(1);
    expect(state.status).toBe('speaking');
  });

  it('clears the latest recognized phrase when advancing', () => {
    const phrasing = runReducer(
      { ...start({ spokenPlaybackAvailable: false }), latestRecognizedPhrase: 'next' },
      { type: 'NEXT' },
    );
    expect(phrasing.latestRecognizedPhrase).toBe('');
  });

  it('transitions to listening when playback is unavailable but voice is available', () => {
    const state = runReducer(start({ spokenPlaybackAvailable: false }), { type: 'NEXT' });
    expect(state.status).toBe('listening');
  });

  it('transitions to manual when neither speech path is available', () => {
    const state = runReducer(
      start({ voiceControlAvailable: false, spokenPlaybackAvailable: false }),
      { type: 'NEXT' },
    );
    expect(state.status).toBe('manual');
  });

  it('completes the run when called on the final item', () => {
    let state = start();
    state = runReducer(state, { type: 'NEXT' }); // -> 1
    state = runReducer(state, { type: 'NEXT' }); // -> 2
    state = runReducer(state, { type: 'NEXT' }); // -> completed
    expect(state.status).toBe('completed');
    expect(state.currentItemIndex).toBe(2);
    expect(state.latestRecognizedPhrase).toBe('');
  });

  it('is a no-op once the run is completed', () => {
    let state = start();
    for (let i = 0; i < snapshot.items.length; i++) state = runReducer(state, { type: 'NEXT' });
    const completed = state;
    expect(runReducer(completed, { type: 'NEXT' })).toBe(completed);
  });
});

describe('runReducer REPEAT', () => {
  it('keeps the same index and re-enters speaking when playback is available', () => {
    const state = runReducer({ ...start(), currentItemIndex: 1 }, { type: 'REPEAT' });
    expect(state.currentItemIndex).toBe(1);
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
    const state = runReducer({ ...start(), currentItemIndex: 2 }, { type: 'PREVIOUS' });
    expect(state.currentItemIndex).toBe(1);
    expect(state.status).toBe('speaking');
  });

  it('stays on the first item and re-enters speaking when already at index 0', () => {
    const state = runReducer({ ...start(), currentItemIndex: 0 }, { type: 'PREVIOUS' });
    expect(state.currentItemIndex).toBe(0);
    expect(state.status).toBe('speaking');
  });

  it('is a no-op when completed', () => {
    const completed = { ...start(), status: 'completed' as const, currentItemIndex: 2 };
    expect(runReducer(completed, { type: 'PREVIOUS' })).toBe(completed);
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
    const completed = { ...start(), status: 'completed' as const, currentItemIndex: 2 };
    const next = runReducer(completed, { type: 'RESTART' });
    expect(next.status).toBe('speaking');
    expect(next.currentItemIndex).toBe(0);
    expect(next.latestRecognizedPhrase).toBe('');
    expect(next.snapshot).toBe(snapshot);
  });

  it('is a no-op when the run is not completed', () => {
    const speaking = { ...start(), status: 'speaking' as const };
    expect(runReducer(speaking, { type: 'RESTART' })).toBe(speaking);
  });
});

describe('runReducer DISCARD_RUN', () => {
  it('clears the snapshot, transcript, and resets status to idle', () => {
    const listening = {
      ...start({ spokenPlaybackAvailable: false }),
      status: 'listening' as const,
      currentItemIndex: 1,
      latestRecognizedPhrase: 'something',
    };
    const next = runReducer(listening, { type: 'DISCARD_RUN' });
    expect(next.status).toBe('idle');
    expect(next.snapshot).toBeNull();
    expect(next.currentItemIndex).toBe(0);
    expect(next.latestRecognizedPhrase).toBe('');
  });
});
