import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { AccountContextValue } from './AccountProvider';
import { AccountGateContent } from './AccountGate';

const actions: Omit<AccountContextValue, 'state'> = {
  selectLocal: async () => undefined,
  signIn: async () => 'completed',
  switchGoogleAccount: async () => 'completed',
  retryAuthentication: async () => 'completed',
  deleteAccount: async () => undefined,
};

describe('AccountGateContent', () => {
  it('shows account choices instead of the library on a fresh install', () => {
    render(
      <AccountGateContent account={{ ...actions, state: { status: 'unselected' } }}>
        <Text>Saved library</Text>
      </AccountGateContent>,
    );

    expect(
      screen.getByRole('button', { name: /use on this device/i }),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Saved library')).not.toBeOnTheScreen();
  });

  it('shows the existing library in local mode', () => {
    render(
      <AccountGateContent account={{ ...actions, state: { status: 'local' } }}>
        <Text>Saved library</Text>
      </AccountGateContent>,
    );

    expect(screen.getByText('Saved library')).toBeOnTheScreen();
  });

  it('keeps the library accessible and shows a temporary warning when refresh is offline', () => {
    render(
      <AccountGateContent
        account={{
          ...actions,
          state: {
            status: 'google',
            identity: {
              sub: 'ada-sub',
              displayName: 'Ada Lovelace',
              email: 'ada@example.com',
            },
            sessionStatus: 'temporarily-unavailable',
          },
        }}
      >
        <Text>Saved library</Text>
      </AccountGateContent>,
    );

    expect(screen.getByText('Saved library')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toBeOnTheScreen();
  });

  it('keeps the library accessible while offering reauthentication in settings', () => {
    render(
      <AccountGateContent
        account={{
          ...actions,
          state: {
            status: 'google',
            identity: {
              sub: 'ada-sub',
              displayName: 'Ada Lovelace',
              email: 'ada@example.com',
            },
            sessionStatus: 'reauth-required',
          },
        }}
      >
        <Text>Saved library</Text>
      </AccountGateContent>,
    );

    expect(screen.getByText('Saved library')).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toBeOnTheScreen();
  });
});
