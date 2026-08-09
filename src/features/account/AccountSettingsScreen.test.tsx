import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { AccountContextValue } from './AccountProvider';
import { AccountSettingsContent } from './AccountSettingsScreen';
import type { AccountState } from './types';

function accountValue(
  state: AccountState,
  overrides: Partial<AccountContextValue> = {},
): AccountContextValue {
  return {
    state,
    selectLocal: jest.fn(async () => undefined),
    signIn: jest.fn(async () => 'completed'),
    switchGoogleAccount: jest.fn(async () => 'completed'),
    retryAuthentication: jest.fn(async () => 'completed'),
    deleteAccount: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('AccountSettingsContent', () => {
  it('identifies local mode and offers optional Google sign-in', () => {
    const account = accountValue({ status: 'local' });

    render(<AccountSettingsContent account={account} />);

    expect(screen.getByText(/this device/i)).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /continue with google/i }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('link', { name: /privacy policy/i }),
    ).toBeOnTheScreen();
  });

  it('shows the Google identity and account-management actions', () => {
    const account = accountValue({
      status: 'google',
      identity: {
        sub: 'ada-sub',
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
      },
      sessionStatus: 'active',
    });

    render(<AccountSettingsContent account={account} />);

    expect(screen.getByText('Ada Lovelace')).toBeOnTheScreen();
    expect(screen.getByText('ada@example.com')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /switch google account/i }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /use on this device/i }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /delete voice checklist account/i }),
    ).toBeOnTheScreen();
  });

  it('offers sign-in again for an invalid or expired session', () => {
    const account = accountValue({
      status: 'google',
      identity: {
        sub: 'ada-sub',
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
      },
      sessionStatus: 'reauth-required',
    });

    render(<AccountSettingsContent account={account} />);

    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /sign in again/i }),
    ).toBeOnTheScreen();
  });

  it('allows an offline refresh to be retried without hiding the library mode', async () => {
    const retryAuthentication = jest.fn(async () => 'completed' as const);
    const account = accountValue(
      {
        status: 'google',
        identity: {
          sub: 'ada-sub',
          displayName: null,
          email: 'ada@example.com',
        },
        sessionStatus: 'temporarily-unavailable',
      },
      { retryAuthentication },
    );
    render(<AccountSettingsContent account={account} />);

    fireEvent.press(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(retryAuthentication).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: /retry/i })).toBeEnabled();
    });
    expect(screen.getByText('ada@example.com')).toBeOnTheScreen();
  });

  it('only deletes the Cognito account after destructive confirmation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const deleteAccount = jest.fn(async () => undefined);
    const account = accountValue(
      {
        status: 'google',
        identity: {
          sub: 'ada-sub',
          displayName: 'Ada Lovelace',
          email: 'ada@example.com',
        },
        sessionStatus: 'active',
      },
      { deleteAccount },
    );
    render(<AccountSettingsContent account={account} />);

    fireEvent.press(
      screen.getByRole('button', { name: /delete voice checklist account/i }),
    );
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete Voice Checklist account?',
      expect.stringMatching(/does not delete your Google account/i),
      expect.any(Array),
      undefined,
    );
    const buttons = alertSpy.mock.calls[0][2] ?? [];
    buttons.find((button) => /delete/i.test(button.text ?? ''))?.onPress?.();

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledTimes(1));
    alertSpy.mockRestore();
  });

  it('reports failed deletion without replacing the account settings', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const account = accountValue(
      {
        status: 'google',
        identity: {
          sub: 'ada-sub',
          displayName: 'Ada Lovelace',
          email: 'ada@example.com',
        },
        sessionStatus: 'active',
      },
      {
        deleteAccount: async () => {
          throw new Error('Deletion did not complete.');
        },
      },
    );
    render(<AccountSettingsContent account={account} />);

    fireEvent.press(
      screen.getByRole('button', { name: /delete voice checklist account/i }),
    );
    const buttons = alertSpy.mock.calls[0][2] ?? [];
    buttons.find((button) => /delete/i.test(button.text ?? ''))?.onPress?.();

    await waitFor(() => expect(screen.getByRole('alert')).toBeOnTheScreen());
    expect(screen.getByText('Ada Lovelace')).toBeOnTheScreen();
    alertSpy.mockRestore();
  });
});
