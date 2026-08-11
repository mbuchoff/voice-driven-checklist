import { act, render } from '@testing-library/react-native';

import { DevicePreferencesProvider } from '@/src/features/settings/DevicePreferencesProvider';
import { MemoryDevicePreferenceStore } from '@/src/features/settings/preferences';
import {
  FakeSpeechPlaybackAdapter,
  FakeSpeechRecognitionAdapter,
} from '@/src/services/speech/fakes';

import { RunScreen, type RunScreenProps } from './RunScreen';
import type { ChecklistRunSnapshot } from './types';

export const runSnapshot: ChecklistRunSnapshot = {
  checklistId: 'cl-1',
  checklistTitle: 'Demo',
  items: [
    { id: 'i1', text: 'Item one', order: 0 },
    { id: 'i2', text: 'Item two', order: 1 },
    { id: 'i3', text: 'Item three', order: 2 },
  ],
};

type RunRenderOptions = Partial<
  Pick<
    RunScreenProps,
    | 'onExit'
    | 'onRequestStop'
    | 'onCompletion'
    | 'onVoiceRunStart'
    | 'onVoiceRunStop'
    | 'initialAvailability'
    | 'onCue'
    | 'screenReaderEnabled'
  >
> & { snapshot?: ChecklistRunSnapshot };

export function setupRunScreen(options: RunRenderOptions = {}) {
  const playback = new FakeSpeechPlaybackAdapter();
  const recognition = new FakeSpeechRecognitionAdapter();
  const onExit = options.onExit ?? jest.fn();
  const onRequestStop = options.onRequestStop ?? jest.fn();
  const onCompletion = options.onCompletion ?? jest.fn();
  const initialAvailability = options.initialAvailability ?? {
    spokenPlaybackAvailable: true,
    voiceControlAvailable: true,
  };

  const utils = render(
    <DevicePreferencesProvider store={new MemoryDevicePreferenceStore()}>
      <RunScreen
        snapshot={options.snapshot ?? runSnapshot}
        playback={playback}
        recognition={recognition}
        initialAvailability={initialAvailability}
        onExit={onExit}
        onRequestStop={onRequestStop}
        onCompletion={onCompletion}
        onCue={options.onCue}
        screenReaderEnabled={options.screenReaderEnabled}
        onVoiceRunStart={options.onVoiceRunStart}
        onVoiceRunStop={options.onVoiceRunStop}
      />
    </DevicePreferencesProvider>,
  );

  return {
    ...utils,
    playback,
    recognition,
    onExit,
    onRequestStop,
    onCompletion,
  };
}

export async function flushRunEffects() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}
