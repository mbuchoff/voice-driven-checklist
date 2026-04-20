import { act, fireEvent, render, screen } from '@testing-library/react-native';

import {
  FakeSpeechPlaybackAdapter,
  FakeSpeechRecognitionAdapter,
} from '@/src/services/speech/fakes';

import { RunScreen, type RunScreenProps } from './RunScreen';
import type { ChecklistRunSnapshot } from './types';

const snapshot: ChecklistRunSnapshot = {
  checklistId: 'cl-1',
  checklistTitle: 'Demo',
  items: [
    { id: 'i1', text: 'Item one', order: 0 },
    { id: 'i2', text: 'Item two', order: 1 },
    { id: 'i3', text: 'Item three', order: 2 },
  ],
};

type RenderOptions = Partial<
  Pick<RunScreenProps, 'onExit' | 'onCompletion' | 'initialAvailability'>
>;

function setup(options: RenderOptions = {}) {
  const playback = new FakeSpeechPlaybackAdapter();
  const recognition = new FakeSpeechRecognitionAdapter();
  const onExit = options.onExit ?? jest.fn();
  const onCompletion = options.onCompletion ?? jest.fn();
  const initialAvailability = options.initialAvailability ?? {
    spokenPlaybackAvailable: true,
    voiceControlAvailable: true,
  };

  const utils = render(
    <RunScreen
      snapshot={snapshot}
      playback={playback}
      recognition={recognition}
      initialAvailability={initialAvailability}
      onExit={onExit}
      onCompletion={onCompletion}
    />,
  );

  return { ...utils, playback, recognition, onExit, onCompletion };
}

async function flush() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

describe('RunScreen', () => {
  describe('initial render', () => {
    it('shows the checklist title, current item, and progress label', async () => {
      setup();
      await flush();

      expect(screen.getByText('Demo')).toBeOnTheScreen();
      expect(screen.getByText('Item one')).toBeOnTheScreen();
      expect(screen.getByText(/item 1 of 3/i)).toBeOnTheScreen();
    });

    it('begins playback of the first item when playback is available', async () => {
      const { playback } = setup();
      await flush();
      expect(playback.spoken).toEqual(['Item one']);
    });

    it('does not start recognition while speaking', async () => {
      const { recognition } = setup();
      await flush();
      expect(recognition.startCount).toBe(0);
      expect(recognition.isListening()).toBe(false);
    });

    it('starts recognition once playback finishes', async () => {
      const { playback, recognition } = setup();
      await flush();

      playback.completePlayback();
      await flush();

      expect(recognition.startCount).toBe(1);
      expect(recognition.isListening()).toBe(true);
    });

    it('skips initial playback when spoken playback is unavailable and goes straight to listening', async () => {
      const { playback, recognition } = setup({
        initialAvailability: { spokenPlaybackAvailable: false, voiceControlAvailable: true },
      });
      await flush();
      expect(playback.spoken).toEqual([]);
      expect(recognition.startCount).toBe(1);
    });

    it('renders the playback unavailable banner when playback is unavailable', async () => {
      setup({ initialAvailability: { spokenPlaybackAvailable: false, voiceControlAvailable: true } });
      await flush();
      expect(screen.getByText(/spoken playback unavailable/i)).toBeOnTheScreen();
    });

    it('renders the voice unavailable banner and stays usable via manual controls', async () => {
      const { recognition } = setup({
        initialAvailability: { spokenPlaybackAvailable: true, voiceControlAvailable: false },
      });
      await flush();
      expect(screen.getByText(/voice control unavailable/i)).toBeOnTheScreen();
      expect(recognition.startCount).toBe(0);
    });

    it('hides the manual status helper line when voice is unavailable (the orange banner already says use the buttons)', async () => {
      const { playback } = setup({
        initialAvailability: { spokenPlaybackAvailable: true, voiceControlAvailable: false },
      });
      await flush();
      playback.completePlayback();
      await flush();
      // Now in the manual state — the orange unavailable banner already says
      // "use the buttons", so the gray helper line is redundant.
      expect(screen.getByText(/voice control unavailable/i)).toBeOnTheScreen();
      expect(screen.queryByText(/use the buttons below to advance/i)).toBeNull();
    });
  });

  describe('voice commands', () => {
    it('updates the transcript and advances on "next"', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();

      act(() => recognition.emitResult({ transcript: 'next', isFinal: true }));
      await flush();

      expect(screen.getByText('Item two')).toBeOnTheScreen();
      expect(screen.getByText(/item 2 of 3/i)).toBeOnTheScreen();
      expect(playback.spoken).toEqual(['Item one', 'Item two']);
    });

    it('repeats the current item on "repeat" without changing progress', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();

      act(() => recognition.emitResult({ transcript: 'repeat', isFinal: true }));
      await flush();

      expect(screen.getByText('Item one')).toBeOnTheScreen();
      expect(screen.getByText(/item 1 of 3/i)).toBeOnTheScreen();
      expect(playback.spoken).toEqual(['Item one', 'Item one']);
    });

    it('moves back on "previous" and re-speaks', async () => {
      const { playback, recognition } = setup();
      await flush();
      // advance to item 2 first
      playback.completePlayback();
      await flush();
      act(() => recognition.emitResult({ transcript: 'next', isFinal: true }));
      await flush();
      playback.completePlayback();
      await flush();

      act(() => recognition.emitResult({ transcript: 'previous', isFinal: true }));
      await flush();

      expect(screen.getByText('Item one')).toBeOnTheScreen();
      expect(playback.spoken).toEqual(['Item one', 'Item two', 'Item one']);
    });

    it('stays on the same item and updates the transcript for non-command speech', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();

      act(() => recognition.emitResult({ transcript: 'hello world', isFinal: true }));
      await flush();

      expect(screen.getByText('Item one')).toBeOnTheScreen();
      expect(screen.getByText('hello world')).toBeOnTheScreen();
      expect(playback.spoken).toEqual(['Item one']);
    });

    it('keeps listening for new utterances after non-command speech', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();
      const startsBefore = recognition.startCount;

      act(() => recognition.emitResult({ transcript: 'gibberish', isFinal: true }));
      await flush();

      expect(recognition.startCount).toBeGreaterThan(startsBefore);
      expect(recognition.isListening()).toBe(true);
    });

    it('ignores non-final recognition results', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();

      act(() => recognition.emitResult({ transcript: 'ne', isFinal: false }));
      await flush();

      expect(playback.spoken).toEqual(['Item one']);
      expect(screen.queryByText('ne')).toBeNull();
    });
  });

  describe('manual controls', () => {
    it('interrupts speech and advances when Next is pressed mid-playback', async () => {
      const { playback } = setup();
      await flush();
      const stopBefore = playback.stopCount;

      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();

      expect(playback.stopCount).toBeGreaterThan(stopBefore);
      expect(screen.getByText('Item two')).toBeOnTheScreen();
      expect(playback.spoken).toEqual(['Item one', 'Item two']);
    });

    it('interrupts speech and repeats when Repeat is pressed mid-playback', async () => {
      const { playback } = setup();
      await flush();

      fireEvent.press(screen.getByTestId('manual-repeat'));
      await flush();

      expect(screen.getByText('Item one')).toBeOnTheScreen();
      expect(playback.spoken).toEqual(['Item one', 'Item one']);
    });

    it('moves back when Previous is pressed', async () => {
      const { playback } = setup();
      await flush();
      // get to item 2
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();

      fireEvent.press(screen.getByTestId('manual-previous'));
      await flush();

      expect(screen.getByText('Item one')).toBeOnTheScreen();
      expect(playback.spoken).toEqual(['Item one', 'Item two', 'Item one']);
    });

    it('stays on item one when Previous is pressed at index 0', async () => {
      const { playback } = setup();
      await flush();
      const before = playback.spoken.length;

      fireEvent.press(screen.getByTestId('manual-previous'));
      await flush();

      expect(screen.getByText('Item one')).toBeOnTheScreen();
      expect(playback.spoken.length).toBe(before + 1); // re-spoke item one
    });

    it('calls onExit when Stop is pressed', async () => {
      const { onExit } = setup();
      await flush();

      fireEvent.press(screen.getByTestId('manual-stop'));
      expect(onExit).toHaveBeenCalledTimes(1);
    });
  });

  describe('completion', () => {
    it('shows the completed view after Next on the final item', async () => {
      const { playback, recognition, onCompletion } = setup();
      await flush();
      // advance to last item
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      // press Next on final item
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();

      expect(screen.getByText(/checklist complete/i)).toBeOnTheScreen();
      expect(screen.getByTestId('completion-restart')).toBeOnTheScreen();
      expect(screen.getByTestId('completion-return')).toBeOnTheScreen();
      expect(recognition.isListening()).toBe(false);
      expect(onCompletion).toHaveBeenCalledTimes(1);
      expect(playback.spoken).toEqual(['Item one', 'Item two', 'Item three']);
    });

    it('Restart resets to the first item without reloading', async () => {
      const { playback } = setup();
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      // Now in completed state.

      fireEvent.press(screen.getByTestId('completion-restart'));
      await flush();

      expect(screen.getByText('Item one')).toBeOnTheScreen();
      expect(screen.getByText(/item 1 of 3/i)).toBeOnTheScreen();
      expect(playback.spoken[playback.spoken.length - 1]).toBe('Item one');
    });

    it('Return to Library calls onExit from the completed view', async () => {
      const { onExit } = setup();
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();

      fireEvent.press(screen.getByTestId('completion-return'));
      expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('does not act on voice commands once completed', async () => {
      const { recognition, playback } = setup();
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();

      const before = playback.spoken.length;
      // Recognition is no longer listening — emit anyway and ensure nothing
      // happens at the screen level.
      act(() => recognition.emitResult({ transcript: 'next', isFinal: true }));
      await flush();
      expect(playback.spoken.length).toBe(before);
      expect(screen.getByText(/checklist complete/i)).toBeOnTheScreen();
    });
  });

  describe('failure modes', () => {
    it('falls back to listening when playback fails mid-run', async () => {
      const { playback, recognition } = setup();
      await flush();

      playback.failPlayback();
      await flush();

      expect(screen.getByText(/spoken playback unavailable/i)).toBeOnTheScreen();
      expect(recognition.isListening()).toBe(true);
    });

    it('marks voice unavailable when recognition errors with a fatal code', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();

      act(() => recognition.emitError('not-allowed'));
      await flush();

      expect(screen.getByText(/voice control unavailable/i)).toBeOnTheScreen();
    });

    it('restarts the listening cycle when recognition emits "no-speech"', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();
      const startsBefore = recognition.startCount;

      act(() => recognition.emitError('no-speech'));
      await flush();

      expect(screen.queryByText(/voice control unavailable/i)).toBeNull();
      expect(recognition.startCount).toBeGreaterThan(startsBefore);
      expect(recognition.isListening()).toBe(true);
    });
  });

  describe('teardown', () => {
    it('disposes both adapters when the screen unmounts', async () => {
      const { unmount, playback, recognition } = setup();
      await flush();

      const playbackDispose = jest.spyOn(playback, 'dispose');
      const recognitionDispose = jest.spyOn(recognition, 'dispose');

      unmount();
      await flush();

      expect(playbackDispose).toHaveBeenCalled();
      expect(recognitionDispose).toHaveBeenCalled();
    });

    it('clears the displayed phrase when leaving listening', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();
      act(() => recognition.emitResult({ transcript: 'hello', isFinal: true }));
      await flush();
      expect(screen.getByText('hello')).toBeOnTheScreen();

      // Now press Next manually -> transitions to speaking, transcript cleared.
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      expect(screen.queryByText('hello')).toBeNull();
    });
  });

  describe('stray callbacks', () => {
    it('ignores recognition results that arrive while speaking', async () => {
      const { playback, recognition } = setup();
      await flush();
      // Force-emit a result while still in speaking state. Our orchestrator
      // should have cleared the listener so nothing happens; verify state stays.
      act(() => recognition.emitResult({ transcript: 'next', isFinal: true }));
      await flush();
      expect(playback.spoken).toEqual(['Item one']);
      expect(screen.getByText('Item one')).toBeOnTheScreen();
    });
  });
});
