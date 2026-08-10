import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { FirstRunScreen } from './FirstRunScreen';

describe('FirstRunScreen', () => {
  it('uses the branded safe-area shell for first launch', () => {
    render(
      <FirstRunScreen
        onSelectLocal={jest.fn()}
        onContinueWithGoogle={jest.fn()}
      />,
    );

    expect(screen.getByTestId('first-run-safe-area')).toBeOnTheScreen();
    expect(screen.getByTestId('first-run-brand-icon')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: /choose how to use voice checklist/i }),
    ).toBeOnTheScreen();
  });

  it('offers accessible local and Google account choices', () => {
    render(
      <FirstRunScreen
        onSelectLocal={jest.fn()}
        onContinueWithGoogle={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: /use on this device/i }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /continue with google/i }),
    ).toBeOnTheScreen();
    expect(screen.getByText(/never uploaded/i)).toBeOnTheScreen();
  });

  it('selects local mode without invoking Google', async () => {
    const onSelectLocal = jest.fn(async () => undefined);
    const onContinueWithGoogle = jest.fn(async () => 'completed' as const);
    render(
      <FirstRunScreen
        onSelectLocal={onSelectLocal}
        onContinueWithGoogle={onContinueWithGoogle}
      />,
    );

    fireEvent.press(
      screen.getByRole('button', { name: /use on this device/i }),
    );

    await waitFor(() => expect(onSelectLocal).toHaveBeenCalledTimes(1));
    expect(onContinueWithGoogle).not.toHaveBeenCalled();
  });

  it('starts interactive Google sign-in from the branded action', async () => {
    const onContinueWithGoogle = jest.fn(async () => 'completed' as const);
    render(
      <FirstRunScreen
        onSelectLocal={jest.fn()}
        onContinueWithGoogle={onContinueWithGoogle}
      />,
    );

    fireEvent.press(
      screen.getByRole('button', { name: /continue with google/i }),
    );

    await waitFor(() =>
      expect(onContinueWithGoogle).toHaveBeenCalledTimes(1),
    );
  });

  it('stays usable without an error when Google sign-in is cancelled', async () => {
    render(
      <FirstRunScreen
        onSelectLocal={jest.fn()}
        onContinueWithGoogle={async () => 'cancelled'}
      />,
    );

    fireEvent.press(
      screen.getByRole('button', { name: /continue with google/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /continue with google/i }),
      ).toBeEnabled();
    });
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('reports a provider failure while leaving both choices available', async () => {
    render(
      <FirstRunScreen
        onSelectLocal={jest.fn()}
        onContinueWithGoogle={async () => {
          throw new Error('Google is unavailable.');
        }}
      />,
    );

    fireEvent.press(
      screen.getByRole('button', { name: /continue with google/i }),
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeOnTheScreen());
    expect(
      screen.getByRole('button', { name: /use on this device/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /continue with google/i }),
    ).toBeEnabled();
  });
});
