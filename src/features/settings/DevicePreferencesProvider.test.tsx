import { Component, type ErrorInfo, type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  DevicePreferencesProvider,
  useDevicePreferences,
} from './DevicePreferencesProvider';
import type {
  DevicePreferences,
  DevicePreferenceStore,
} from './preferences';

function preferenceStore(
  load: () => Promise<DevicePreferences>,
): DevicePreferenceStore {
  return {
    load,
    saveTheme: async () => undefined,
    saveSound: async () => undefined,
  };
}

function PreferenceConsumer() {
  const { preferences } = useDevicePreferences();
  return <Text>{`${preferences.theme}:${preferences.sound}`}</Text>;
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
    finishLoad({ theme: 'dark', sound: 'wood' });
    await waitFor(() => expect(screen.getByText('dark:wood')).toBeOnTheScreen());
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
