import { Component, type ErrorInfo, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import {
  DevicePreferencesProvider,
  useDevicePreferences,
} from './DevicePreferencesProvider';
import {
  DEFAULT_DEVICE_PREFERENCES,
  MemoryDevicePreferenceStore,
  type DevicePreferences,
  type DevicePreferenceStore,
} from './preferences';

function preferenceStore(
  load: () => Promise<DevicePreferences>,
): DevicePreferenceStore {
  return {
    load,
    saveTheme: async () => undefined,
    saveSound: async () => undefined,
    dismissRoutineReorderHint: async () => undefined,
    saveRecentTimerSeconds: async () => undefined,
  };
}

function PreferenceConsumer() {
  const { preferences, dismissRoutineReorderHint, rememberTimerSeconds } = useDevicePreferences();
  return (
    <>
      <Text>{`${preferences.theme}:${preferences.sound}:${preferences.routineReorderHintDismissed}`}</Text>
      <Text testID="recent-times">{preferences.recentTimerSeconds.join(',')}</Text>
      <Pressable
        testID="dismiss-routine-reorder-hint"
        onPress={() => void dismissRoutineReorderHint()}
      />
      <Pressable testID="use-90" onPress={() => void rememberTimerSeconds(90)} />
    </>
  );
}

class TestErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  render() {
    return this.state.error ? (
      <Text testID="preference-error">{this.state.error.message}</Text>
    ) : (
      this.props.children
    );
  }
}

describe('DevicePreferencesProvider', () => {
  it('waits for persisted preferences before mounting consumers', async () => {
    let finishLoad: (preferences: DevicePreferences) => void = () => undefined;
    const store = preferenceStore(
      () => new Promise((resolve) => {
        finishLoad = resolve;
      }),
    );

    render(
      <DevicePreferencesProvider store={store}>
        <PreferenceConsumer />
      </DevicePreferencesProvider>,
    );

    expect(screen.queryByText(/:/)).toBeNull();
    finishLoad({
      theme: 'dark',
      sound: 'wood',
      routineReorderHintDismissed: false,
      recentTimerSeconds: [],
    });
    await waitFor(() =>
      expect(screen.getByText('dark:wood:false')).toBeOnTheScreen(),
    );
  });

  it('dismisses the routine reorder hint through the device store', async () => {
    let persisted = false;
    const store: DevicePreferenceStore = {
      load: async () => ({
        theme: 'system',
        sound: 'chime',
        routineReorderHintDismissed: persisted,
        recentTimerSeconds: [],
      }),
      saveTheme: async () => undefined,
      saveSound: async () => undefined,
      dismissRoutineReorderHint: async () => {
        persisted = true;
      },
      saveRecentTimerSeconds: async () => undefined,
    };
    render(
      <DevicePreferencesProvider store={store}>
        <PreferenceConsumer />
      </DevicePreferencesProvider>,
    );
    await screen.findByText('system:chime:false');

    fireEvent.press(screen.getByTestId('dismiss-routine-reorder-hint'));

    await waitFor(() =>
      expect(screen.getByText('system:chime:true')).toBeOnTheScreen(),
    );
  });

  it('remembers a used timer length first and saves the list', async () => {
    const store = new MemoryDevicePreferenceStore({
      ...DEFAULT_DEVICE_PREFERENCES,
      recentTimerSeconds: [30, 90, 60, 120],
    });
    render(
      <DevicePreferencesProvider store={store}>
        <PreferenceConsumer />
      </DevicePreferencesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('recent-times')).toHaveTextContent('30,90,60,120'));

    fireEvent.press(screen.getByTestId('use-90'));

    await waitFor(() => expect(screen.getByTestId('recent-times')).toHaveTextContent('90,30,60,120'));
    await expect(store.load()).resolves.toMatchObject({ recentTimerSeconds: [90, 30, 60, 120] });
  });

  it('surfaces preference load failures to the app error boundary', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const store = preferenceStore(async () => {
      throw new Error('preferences unavailable');
    });

    render(
      <TestErrorBoundary>
        <DevicePreferencesProvider store={store}>
          <PreferenceConsumer />
        </DevicePreferencesProvider>
      </TestErrorBoundary>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('preference-error')).toHaveTextContent(
        'preferences unavailable',
      ),
    );
    consoleError.mockRestore();
  });

  it('rejects consumers outside the provider boundary', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<PreferenceConsumer />)).toThrow(
      'useDevicePreferences must be used within DevicePreferencesProvider.',
    );
    consoleError.mockRestore();
  });
});
