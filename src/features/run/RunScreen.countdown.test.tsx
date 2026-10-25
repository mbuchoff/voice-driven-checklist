import { act, fireEvent, screen } from '@testing-library/react-native';

import { setupRunScreen } from './RunScreen.testSupport';
import type { RoutineRunSnapshot } from './types';

jest.mock('@/src/services/power/countdownWakeLock', () => ({
  acquireCountdownWakeLock: jest.fn(),
  releaseCountdownWakeLock: jest.fn(),
}));

const timed: RoutineRunSnapshot = {
  routineId: 'stretch',
  routineTitle: 'Stretch',
  steps: [
    { id: 's1', text: 'Plank', order: 0, timerSeconds: 5 },
    { id: 's2', text: 'Rest', order: 1, timerSeconds: null },
    { id: 's3', text: 'Side plank', order: 2, timerSeconds: 3 },
  ],
};

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

describe('RunScreen countdowns', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts a timed step’s countdown on arrival, cuts the reading off at zero and moves on with the next cue', async () => {
    const onCue = jest.fn();
    const { playback } = setupRunScreen({ snapshot: timed, onCue });
    await advance(0);
    // Still reading step one when its time runs out.
    expect(playback.spoken).toEqual(['Plank']);
    expect(screen.getByTestId('run-countdown')).toHaveTextContent('0:05');

    await advance(3000);
    expect(screen.getByTestId('run-countdown')).toHaveTextContent('0:02');
    await advance(2000);

    expect(onCue).toHaveBeenCalledWith('next');
    expect(playback.stopCount).toBeGreaterThan(0);
    expect(screen.getByTestId('run-step-1').props.accessibilityState).toEqual({ selected: true });
    expect(screen.queryByTestId('run-countdown')).toBeNull();
  });

  describe('when "next" and zero come together', () => {
    const threeTimed: RoutineRunSnapshot = {
      ...timed,
      steps: timed.steps.map((step) => ({ ...step, timerSeconds: 5 })),
    };
    async function listeningNearZero() {
      const onCue = jest.fn();
      const run = setupRunScreen({ snapshot: threeTimed, onCue });
      await advance(0);
      await act(async () => run.playback.completePlayback());
      await advance(4750);
      return { ...run, onCue };
    }
    const onStep = (index: number) =>
      expect(screen.getByTestId(`run-step-${index}`, { includeHiddenElements: true }).props.accessibilityState)
        .toEqual({ selected: true });

    it('moves on once when "next" is heard just before zero', async () => {
      const { recognition, onCue } = await listeningNearZero();

      await act(async () => {
        recognition.emitResult({ transcript: 'next', isFinal: true });
        jest.advanceTimersByTime(250);
      });

      onStep(1);
      expect(onCue).toHaveBeenCalledTimes(1);
    });

    it('moves on once when "next" is heard just after zero', async () => {
      const { recognition, onCue } = await listeningNearZero();

      await act(async () => {
        jest.advanceTimersByTime(250);
        recognition.emitResult({ transcript: 'next', isFinal: true });
      });

      onStep(1);
      expect(onCue).toHaveBeenCalledTimes(1);
    });
  });

  it('waits on an untimed step as today', async () => {
    setupRunScreen({ snapshot: timed });
    await advance(0);
    await advance(5000);
    expect(screen.getByTestId('run-step-1').props.accessibilityState).toEqual({ selected: true });

    await advance(60_000);
    expect(screen.getByTestId('run-step-1').props.accessibilityState).toEqual({ selected: true });
  });

  it('keeps the countdown running through a repeat', async () => {
    const { playback } = setupRunScreen({ snapshot: timed });
    await advance(0);
    await act(async () => playback.completePlayback());
    await advance(3000);

    fireEvent.press(screen.getByTestId('manual-repeat'));
    await advance(1000);
    expect(screen.getByTestId('run-countdown')).toHaveTextContent('0:01');
    await advance(1000);
    expect(screen.getByTestId('run-step-1').props.accessibilityState).toEqual({ selected: true });
  });

  it('starts the step you land on from its full time after next or previous', async () => {
    setupRunScreen({ snapshot: timed });
    await advance(0);
    await advance(4000);

    fireEvent.press(screen.getByTestId('manual-next'));
    fireEvent.press(screen.getByTestId('manual-previous'));
    await advance(0);

    expect(screen.getByTestId('run-countdown')).toHaveTextContent('0:05');
    await advance(4000);
    expect(screen.getByTestId('run-step-0').props.accessibilityState).toEqual({ selected: true });
  });

  it('finishes the run when the last step’s countdown runs out', async () => {
    const onCompletion = jest.fn();
    setupRunScreen({ snapshot: timed, onCompletion });
    await advance(0);
    await advance(5000);
    fireEvent.press(screen.getByTestId('manual-next'));
    await advance(3000);

    expect(screen.getByTestId('completion-screen')).toBeOnTheScreen();
  });
});
