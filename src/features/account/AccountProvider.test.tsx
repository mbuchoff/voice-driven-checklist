import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { AccountManager } from './AccountManager';
import { AccountProvider, useAccount } from './AccountProvider';
import type { CognitoAuthClient } from './cognito';
import { MemoryAccountPreferenceStore } from './preferences';
import { MemoryRefreshTokenStore } from './refreshTokenStore';

const unusedCognito: CognitoAuthClient = {
  signIn: async () => ({ type: 'cancelled' }),
  refresh: async () => {
    throw new Error('not used');
  },
  revoke: async () => undefined,
  deleteUser: async () => undefined,
};

function AccountConsumer() {
  const account = useAccount();
  return (
    <>
      <Text testID="account-state">{account.state.status}</Text>
      <Text testID="account-api">{Object.keys(account).sort().join(',')}</Text>
      <Pressable accessibilityRole="button" onPress={account.selectLocal}>
        <Text>Choose local</Text>
      </Pressable>
    </>
  );
}

describe('AccountProvider', () => {
  it('publishes restored state and account actions without credentials', async () => {
    const manager = new AccountManager(
      new MemoryAccountPreferenceStore(),
      new MemoryRefreshTokenStore(),
      unusedCognito,
    );

    render(
      <AccountProvider manager={manager}>
        <AccountConsumer />
      </AccountProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('account-state')).toHaveTextContent('unselected');
    });
    expect(screen.getByTestId('account-api')).not.toHaveTextContent(/token/i);

    fireEvent.press(screen.getByRole('button', { name: 'Choose local' }));
    await waitFor(() => {
      expect(screen.getByTestId('account-state')).toHaveTextContent('local');
    });
  });
});
