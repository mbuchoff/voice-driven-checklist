import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { BackHandler, Platform, StyleSheet } from 'react-native';

import {
  FakeSpeechPlaybackAdapter,
  FakeSpeechRecognitionAdapter,
} from '@/src/services/speech/fakes';

import { RunScreen, type RunScreenProps } from './RunScreen';
import { RUN_ITEM_GAP } from './runPresentation';
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

const defaultPlatformOS = Platform.OS;
const defaultPlatformVersion = Platform.Version;
let mockHardwareBackHandler: (() => boolean | null | undefined) | null = null;

type RenderOptions = Partial<
  Pick<
    RunScreenProps,
    | 'onExit'
    | 'onRequestStop'
    | 'onCompletion'
    | 'onVoiceRunStart'
    | 'onVoiceRunStop'
    | 'initialAvailability'
    | 'onStopHoldComplete'
    | 'onCue'
    | 'screenReaderEnabled'
  >
> & { snapshot?: ChecklistRunSnapshot };

function setup(options: RenderOptions = {}) {
  const playback = new FakeSpeechPlaybackAdapter();
  const recognition = new FakeSpeechRecognitionAdapter();
  const onExit = options.onExit ?? jest.fn();
  const onRequestStop = options.onRequestStop ?? jest.fn();
  const onStopHoldComplete = options.onStopHoldComplete ?? jest.fn();
  const onCompletion = options.onCompletion ?? jest.fn();
  const initialAvailability = options.initialAvailability ?? {
    spokenPlaybackAvailable: true,
    voiceControlAvailable: true,
  };

  const utils = render(
    <RunScreen
      snapshot={options.snapshot ?? snapshot}
      playback={playback}
      recognition={recognition}
      initialAvailability={initialAvailability}
      onExit={onExit}
      onRequestStop={onRequestStop}
      onStopHoldComplete={onStopHoldComplete}
      onCompletion={onCompletion}
      onCue={options.onCue}
      screenReaderEnabled={options.screenReaderEnabled}
      onVoiceRunStart={options.onVoiceRunStart}
      onVoiceRunStop={options.onVoiceRunStop}
    />,
  );

  return {
    ...utils,
    playback,
    recognition,
    onExit,
    onRequestStop,
    onStopHoldComplete,
    onCompletion,
  };
}

async function flush() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function useAndroidHardwareBack() {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => 'android',
  });
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    mockHardwareBackHandler = handler;
    return { remove: jest.fn() };
  });
}

describe('RunScreen', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    mockHardwareBackHandler = null;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => defaultPlatformOS,
    });
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      get: () => defaultPlatformVersion,
    });
  });

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

    it('keeps every snapshot item mounted while only the current row is selected', async () => {
      const longSnapshot: ChecklistRunSnapshot = {
        checklistId: 'long',
        checklistTitle: 'Long routine',
        items: Array.from({ length: 17 }, (_, index) => ({
          id: `long-${index}`,
          text: `Step ${index + 1}`,
          order: index,
        })),
      };
      setup({ snapshot: longSnapshot });
      await flush();

      expect(
        screen.getAllByTestId(/run-item-/, { includeHiddenElements: true }),
      ).toHaveLength(17);
      expect(
        screen.getByText('Step 17', { includeHiddenElements: true }),
      ).toBeOnTheScreen();
      expect(screen.getByTestId('run-item-0').props.accessibilityState).toMatchObject({
        selected: true,
      });

      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();

      expect(
        screen.getAllByTestId(/run-item-/, { includeHiddenElements: true }),
      ).toHaveLength(17);
      expect(screen.getByTestId('run-item-1').props.accessibilityState).toMatchObject({
        selected: true,
      });
    });

    it('clears native blur when a background item becomes current', async () => {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        get: () => 'android',
      });
      Object.defineProperty(Platform, 'Version', {
        configurable: true,
        get: () => 36,
      });
      setup();
      await flush();

      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();

      const currentStyle = StyleSheet.flatten(
        screen.getByTestId('run-item-1').props.style,
      );
      expect(currentStyle.filter).toEqual([{ blur: 0 }]);
    });

    it('centers variable-height rows on the same track positions', async () => {
      setup({
        snapshot: {
          ...snapshot,
          items: [
            {
              id: 'long',
              text: 'A long step that wraps across several lines on a phone screen',
              order: 0,
            },
            { id: 'short', text: 'Short step', order: 1 },
          ],
        },
      });
      await flush();

      const firstStyle = StyleSheet.flatten(
        screen.getByTestId('run-item-0').props.style,
      );
      const secondStyle = StyleSheet.flatten(
        screen.getByTestId('run-item-1', { includeHiddenElements: true }).props
          .style,
      );
      expect(firstStyle.top).toBe(0);
      expect(secondStyle.top).toBe(RUN_ITEM_GAP);
      expect(firstStyle.transform).toContainEqual({ translateY: '-50%' });
      expect(secondStyle.transform).toContainEqual({ translateY: '-50%' });
    });

    it('waits for the Android voice run startup before speaking the first item', async () => {
      let resolveStartup!: () => void;
      const startupFinished = new Promise<void>((resolve) => {
        resolveStartup = resolve;
      });
      const { playback, recognition } = setup({
        onVoiceRunStart: jest.fn(() => startupFinished),
      });
      await flush();

      expect(playback.spoken).toEqual([]);
      expect(recognition.startCount).toBe(0);

      await act(async () => {
        resolveStartup();
        await startupFinished;
      });
      await flush();

      expect(playback.spoken).toEqual(['Item one']);
      expect(recognition.startCount).toBe(0);
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

    it('advances on a strict non-final "next" command', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();

      act(() => recognition.emitResult({ transcript: 'next', isFinal: false }));
      await flush();

      expect(screen.getByText('Item two')).toBeOnTheScreen();
      expect(screen.getByText(/item 2 of 3/i)).toBeOnTheScreen();
      expect(playback.spoken).toEqual(['Item one', 'Item two']);
    });

    it('waits for finalization before accepting loose command phrases', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();

      act(() => recognition.emitResult({ transcript: 'go to the next one please', isFinal: false }));
      await flush();

      expect(screen.getByText('Item one')).toBeOnTheScreen();
      expect(playback.spoken).toEqual(['Item one']);

      act(() => recognition.emitResult({ transcript: 'go to the next one please', isFinal: true }));
      await flush();

      expect(screen.getByText('Item two')).toBeOnTheScreen();
      expect(playback.spoken).toEqual(['Item one', 'Item two']);
    });

    it('ignores extra finalized commands from the same listening cycle', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();

      act(() => {
        recognition.emitResult({ transcript: 'next', isFinal: true });
        recognition.emitResult({ transcript: 'next', isFinal: true });
      });
      await flush();

      expect(screen.getByText('Item two')).toBeOnTheScreen();
      expect(screen.getByText(/item 2 of 3/i)).toBeOnTheScreen();
      expect(screen.queryByText('Item three')).toBeNull();
    });

    it('ignores a final command repeated after an accepted interim command', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();

      act(() => {
        recognition.emitResult({ transcript: 'next', isFinal: false });
        recognition.emitResult({ transcript: 'next', isFinal: true });
      });
      await flush();

      expect(screen.getByText('Item two')).toBeOnTheScreen();
      expect(screen.getByText(/item 2 of 3/i)).toBeOnTheScreen();
      expect(screen.queryByText('Item three')).toBeNull();
    });

    it('does not reopen the mic when a command result is immediately followed by recognition end', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();
      const startsBefore = recognition.startCount;

      act(() => {
        recognition.emitResult({ transcript: 'next', isFinal: true });
        recognition.emitError('aborted');
      });

      expect(recognition.startCount).toBe(startsBefore);
      await flush();
      expect(screen.getByText('Item two')).toBeOnTheScreen();
    });

    it('rearms listening after a command when spoken playback is unavailable', async () => {
      const { recognition } = setup({
        initialAvailability: { spokenPlaybackAvailable: false, voiceControlAvailable: true },
      });
      await flush();
      const startsBefore = recognition.startCount;

      act(() => {
        recognition.emitResult({ transcript: 'next', isFinal: true });
        recognition.emitError('aborted');
      });
      await flush();

      expect(screen.getByText('Item two')).toBeOnTheScreen();
      expect(recognition.startCount).toBeGreaterThan(startsBefore);
      expect(recognition.isListening()).toBe(true);
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

    it('keeps the same continuous listening session after non-command speech', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();
      const startsBefore = recognition.startCount;

      act(() => recognition.emitResult({ transcript: 'gibberish', isFinal: true }));
      await flush();

      expect(recognition.startCount).toBe(startsBefore);
      expect(recognition.isListening()).toBe(true);
    });

    it('restarts after non-command speech when a non-continuous recognizer ends', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();
      const startsBefore = recognition.startCount;

      act(() => {
        recognition.emitResult({ transcript: 'gibberish', isFinal: true });
        recognition.emitError('aborted');
      });
      await flush();

      await waitFor(() => expect(recognition.startCount).toBeGreaterThan(startsBefore));
      expect(recognition.isListening()).toBe(true);
    });

    it('accepts a command that arrives immediately after a non-command phrase ends', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();

      act(() => {
        recognition.emitResult({ transcript: 'hello how are you doing', isFinal: true });
        recognition.emitError('aborted');
        recognition.emitResult({ transcript: 'next', isFinal: true });
      });
      await flush();

      expect(screen.getByText('Item two')).toBeOnTheScreen();
      expect(screen.getByText(/item 2 of 3/i)).toBeOnTheScreen();
      expect(playback.spoken).toEqual(['Item one', 'Item two']);
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

    it('plays the action cue before beginning speech roughly 175ms later', async () => {
      const onCue = jest.fn();
      const { playback } = setup({ onCue });
      await flush();
      jest.useFakeTimers();

      fireEvent.press(screen.getByTestId('manual-next'));

      expect(onCue).toHaveBeenCalledWith('next');
      expect(playback.spoken).toEqual(['Item one']);

      await act(async () => {
        jest.advanceTimersByTime(174);
        await Promise.resolve();
      });
      expect(playback.spoken).toEqual(['Item one']);

      await act(async () => {
        jest.advanceTimersByTime(1);
        await Promise.resolve();
      });
      expect(playback.spoken).toEqual(['Item one', 'Item two']);
      jest.useRealTimers();
    });

    it('uses distinct cues for Repeat and Previous', async () => {
      const onCue = jest.fn();
      setup({ onCue });
      await flush();

      fireEvent.press(screen.getByTestId('manual-repeat'));
      fireEvent.press(screen.getByTestId('manual-previous'));

      expect(onCue.mock.calls.map(([action]) => action)).toEqual([
        'repeat',
        'previous',
      ]);
    });

    it('keeps the run active when the pointer hold is released early', async () => {
      const { onStopHoldComplete, onRequestStop } = setup({
        screenReaderEnabled: false,
      });
      await flush();
      jest.useFakeTimers();

      fireEvent(screen.getByTestId('stop-run'), 'pressIn');
      expect(screen.getByText(/keep holding/i)).toBeOnTheScreen();
      act(() => jest.advanceTimersByTime(600));
      fireEvent(screen.getByTestId('stop-run'), 'pressOut');

      act(() => jest.advanceTimersByTime(1200));
      expect(onStopHoldComplete).not.toHaveBeenCalled();
      expect(onRequestStop).not.toHaveBeenCalled();
      expect(screen.queryByText(/keep holding/i)).toBeNull();
      jest.useRealTimers();
    });

    it('stops directly after the complete 1.2-second pointer hold', async () => {
      const { onStopHoldComplete, onRequestStop } = setup({
        screenReaderEnabled: false,
      });
      await flush();
      jest.useFakeTimers();

      fireEvent(screen.getByTestId('stop-run'), 'pressIn');
      act(() => jest.advanceTimersByTime(1200));

      expect(onStopHoldComplete).toHaveBeenCalledTimes(1);
      expect(onRequestStop).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('opens confirmation when TalkBack activates the X', async () => {
      const { onStopHoldComplete, onRequestStop } = setup({
        screenReaderEnabled: true,
      });
      await flush();

      fireEvent.press(screen.getByTestId('stop-run'));

      expect(onRequestStop).toHaveBeenCalledTimes(1);
      expect(onStopHoldComplete).not.toHaveBeenCalled();
    });

    it('requests confirmation when Android back is pressed during an active run', async () => {
      useAndroidHardwareBack();
      const { onExit, onRequestStop } = setup();
      await flush();

      let handled = false;
      act(() => {
        handled = mockHardwareBackHandler?.() ?? false;
      });

      expect(handled).toBe(true);
      expect(onRequestStop).toHaveBeenCalledTimes(1);
      expect(onExit).not.toHaveBeenCalled();
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

    it('returns to the library when Android back is pressed after completion', async () => {
      useAndroidHardwareBack();
      const { onExit, onRequestStop } = setup();
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();

      let handled = false;
      act(() => {
        handled = mockHardwareBackHandler?.() ?? false;
      });

      expect(handled).toBe(true);
      expect(onExit).toHaveBeenCalledTimes(1);
      expect(onRequestStop).not.toHaveBeenCalled();
    });

    it('stops the listening service after the completion callback resolves', async () => {
      let resolveCompletion!: () => void;
      const completionFinished = new Promise<void>((resolve) => {
        resolveCompletion = resolve;
      });
      const onCompletion = jest.fn(() => completionFinished);
      const onVoiceRunStop = jest.fn();
      setup({ onCompletion, onVoiceRunStart: jest.fn(), onVoiceRunStop });
      await flush();

      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();

      expect(onCompletion).toHaveBeenCalledTimes(1);
      expect(onVoiceRunStop).not.toHaveBeenCalled();

      await act(async () => {
        resolveCompletion();
        await completionFinished;
      });
      await flush();

      expect(onVoiceRunStop).toHaveBeenCalledTimes(1);
    });

    it('does not let a pending completion callback stop a restarted run', async () => {
      let resolveCompletion!: () => void;
      const completionFinished = new Promise<void>((resolve) => {
        resolveCompletion = resolve;
      });
      const onCompletion = jest.fn(() => completionFinished);
      const onVoiceRunStop = jest.fn();
      setup({ onCompletion, onVoiceRunStart: jest.fn(), onVoiceRunStop });
      await flush();

      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();

      fireEvent.press(screen.getByTestId('completion-restart'));
      await flush();
      expect(screen.getByText('Item one')).toBeOnTheScreen();

      await act(async () => {
        resolveCompletion();
        await completionFinished;
      });
      await flush();

      expect(onVoiceRunStop).not.toHaveBeenCalled();
    });

    it('waits for pending listening-service startup before stopping it on completion', async () => {
      let resolveNotification!: () => void;
      const notificationStarted = new Promise<void>((resolve) => {
        resolveNotification = resolve;
      });
      const onCompletion = jest.fn();
      const onVoiceRunStop = jest.fn();
      setup({
        initialAvailability: { spokenPlaybackAvailable: false, voiceControlAvailable: true },
        onCompletion,
        onVoiceRunStart: jest.fn(() => notificationStarted),
        onVoiceRunStop,
      });
      await flush();

      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();

      expect(onCompletion).toHaveBeenCalledTimes(1);
      expect(onVoiceRunStop).not.toHaveBeenCalled();

      await act(async () => {
        resolveNotification();
        await notificationStarted;
      });
      await flush();

      expect(onVoiceRunStop).toHaveBeenCalledTimes(1);
    });

    it('does not let stale startup cleanup stop a restarted run', async () => {
      let resolveNotification!: () => void;
      const notificationStarted = new Promise<void>((resolve) => {
        resolveNotification = resolve;
      });
      const onVoiceRunStop = jest.fn();
      setup({
        initialAvailability: { spokenPlaybackAvailable: false, voiceControlAvailable: true },
        onVoiceRunStart: jest.fn(() => notificationStarted),
        onVoiceRunStop,
      });
      await flush();

      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('completion-restart'));
      await flush();

      await act(async () => {
        resolveNotification();
        await notificationStarted;
      });
      await flush();

      expect(screen.getByText('Item one')).toBeOnTheScreen();
      expect(onVoiceRunStop).not.toHaveBeenCalled();
    });

    it('waits for an in-flight completion stop before starting a restarted run', async () => {
      let resolveStop!: () => void;
      const stopFinished = new Promise<void>((resolve) => {
        resolveStop = resolve;
      });
      const onVoiceRunStart = jest.fn();
      const onVoiceRunStop = jest.fn(() => stopFinished);
      setup({ onVoiceRunStart, onVoiceRunStop });
      await flush();

      expect(onVoiceRunStart).toHaveBeenCalledTimes(1);

      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();
      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();

      expect(onVoiceRunStop).toHaveBeenCalledTimes(1);

      fireEvent.press(screen.getByTestId('completion-restart'));
      await flush();

      expect(screen.getByText('Item one')).toBeOnTheScreen();
      expect(onVoiceRunStart).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveStop();
        await stopFinished;
      });
      await flush();

      await waitFor(() => expect(onVoiceRunStart).toHaveBeenCalledTimes(2));
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

    it('marks voice unavailable without restarting after a fatal recognition error', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();
      const startsBefore = recognition.startCount;

      act(() => {
        recognition.emitError('not-allowed');
        recognition.emitError('aborted');
      });
      await flush();

      expect(screen.getByText(/voice control unavailable/i)).toBeOnTheScreen();
      expect(recognition.startCount).toBe(startsBefore);
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
      expect(recognition.startCount).toBe(startsBefore);

      await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 550));
      });

      expect(recognition.startCount).toBeGreaterThan(startsBefore);
      expect(recognition.isListening()).toBe(true);
    });

    it('restarts promptly when the recognizer ends naturally', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();
      const startsBefore = recognition.startCount;

      act(() => recognition.emitError('aborted'));
      await flush();

      expect(recognition.startCount).toBeGreaterThan(startsBefore);
      expect(recognition.isListening()).toBe(true);
    });

    it('restarts the listening cycle when Android reports no finalized speech match', async () => {
      const { playback, recognition } = setup();
      await flush();
      playback.completePlayback();
      await flush();
      const startsBefore = recognition.startCount;

      act(() => recognition.emitError('no-match'));
      await flush();

      expect(screen.queryByText(/voice control unavailable/i)).toBeNull();
      expect(recognition.startCount).toBe(startsBefore);

      await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 550));
      });

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

  describe('foreground listening notification', () => {
    it('waits for the Android listening notification before opening the mic', async () => {
      let resolveNotification!: () => void;
      const notificationStarted = new Promise<void>((resolve) => {
        resolveNotification = resolve;
      });
      const { recognition } = setup({
        initialAvailability: { spokenPlaybackAvailable: false, voiceControlAvailable: true },
        onVoiceRunStart: jest.fn(() => notificationStarted),
      });
      await flush();

      expect(recognition.startCount).toBe(0);

      await act(async () => {
        resolveNotification();
        await notificationStarted;
      });
      await flush();

      expect(recognition.startCount).toBe(1);
      expect(recognition.isListening()).toBe(true);
    });

    it('stops the Android listening notification if startup finishes after exit', async () => {
      let resolveNotification!: () => void;
      const notificationStarted = new Promise<void>((resolve) => {
        resolveNotification = resolve;
      });
      const onVoiceRunStop = jest.fn();
      const { unmount } = setup({
        initialAvailability: { spokenPlaybackAvailable: false, voiceControlAvailable: true },
        onVoiceRunStart: jest.fn(() => notificationStarted),
        onVoiceRunStop,
      });
      await flush();

      unmount();
      await flush();
      expect(onVoiceRunStop).not.toHaveBeenCalled();

      await act(async () => {
        resolveNotification();
        await notificationStarted;
      });
      await flush();

      expect(onVoiceRunStop).toHaveBeenCalledTimes(1);
    });

    it('marks voice unavailable when the Android listening notification cannot start', async () => {
      const { playback, recognition } = setup({
        onVoiceRunStart: jest.fn(async () => {
          throw new Error('notification permission denied');
        }),
      });
      await flush();
      await flush();

      expect(screen.getByText(/voice control unavailable/i)).toBeOnTheScreen();
      expect(recognition.startCount).toBe(0);
      expect(playback.spoken).toEqual(['Item one']);
    });
  });
});
