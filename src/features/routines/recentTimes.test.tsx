import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { AccountManager } from '@/src/features/account/AccountManager';
import { AccountProvider, useAccount } from '@/src/features/account/AccountProvider';
import type { CognitoAuthClient, InteractiveSignInResult } from '@/src/features/account/cognito';
import { MemoryAccountPreferenceStore } from '@/src/features/account/preferences';
import { MemoryRefreshTokenStore } from '@/src/features/account/refreshTokenStore';
import type { GoogleIdentity } from '@/src/features/account/types';

import { AppRecentTimesProvider, rememberTime, useRecentTimes } from './recentTimes';

const ADA: GoogleIdentity = { sub: 'ada-sub', displayName: 'Ada', email: 'ada@example.com' };
const GRACE: GoogleIdentity = { sub: 'grace-sub', displayName: 'Grace', email: 'grace@example.com' };

/** Signs in as whoever `next` names, with fresh tokens each time. */
class SignInAs implements CognitoAuthClient {
  next: GoogleIdentity = ADA;
  private count = 0;
  async signIn(): Promise<InteractiveSignInResult> {
    this.count += 1;
    return {
      type: 'success',
      identity: this.next,
      tokens: { accessToken: `access-${this.count}`, idToken: `id-${this.count}`, refreshToken: `refresh-${this.count}` },
    };
  }
  async refresh(): Promise<never> {
    throw new Error('not used');
  }
  async revoke(): Promise<void> {}
  async deleteUser(): Promise<void> {}
}

function Probe() {
  const { recent, remember } = useRecentTimes();
  const account = useAccount();
  return (
    <>
      <Text testID="recent">{recent.join(',')}</Text>
      <Pressable testID="use-45" onPress={() => remember(45)} />
      <Pressable testID="use-90" onPress={() => remember(90)} />
      <Pressable
        testID="use-45-then-120"
        onPress={() => {
          remember(45);
          remember(120);
        }}
      />
      <Pressable testID="sign-in" onPress={() => void account.signIn()} />
      <Pressable testID="go-local" onPress={() => void account.selectLocal()} />
      <Pressable testID="delete-account" onPress={() => void account.deleteAccount()} />
    </>
  );
}

async function renderApp() {
  const cognito = new SignInAs();
  const manager = new AccountManager(
    new MemoryAccountPreferenceStore({ mode: 'local' }),
    new MemoryRefreshTokenStore(),
    cognito,
  );
  render(
    <AccountProvider manager={manager}>
      <AppRecentTimesProvider>
        <Probe />
      </AppRecentTimesProvider>
    </AccountProvider>,
  );
  await act(async () => {});
  const tap = async (id: string) => {
    await act(async () => {
      fireEvent.press(screen.getByTestId(id));
    });
  };
  return { cognito, tap };
}

describe('recent time chips', () => {
  it('lists the times used, most recent first, up to four', () => {
    expect(rememberTime([], 45)).toEqual([45]);
    expect(rememberTime([30, 45, 60, 90], 45)).toEqual([45, 30, 60, 90]);
    expect(rememberTime([30, 45, 60, 90], 120)).toEqual([120, 30, 45, 60]);
  });

  it('keeps both of two times used back to back', async () => {
    const { tap } = await renderApp();
    await tap('use-90');
    await tap('use-45-then-120');
    expect(screen.getByTestId('recent')).toHaveTextContent('120,45,90');
  });

  it('starts empty when the app starts', async () => {
    await renderApp();
    expect(screen.getByTestId('recent')).toHaveTextContent(/^$/);
  });

  it('keeps the times while the account stays the same, including signing in to the same Google account again', async () => {
    const { tap } = await renderApp();
    await tap('sign-in');
    await tap('use-45');
    await tap('use-90');
    await tap('sign-in');
    expect(screen.getByTestId('recent')).toHaveTextContent('90,45');
  });

  it('forgets the times when the app moves from no account to a Google account', async () => {
    const { tap } = await renderApp();
    await tap('use-45');
    await tap('sign-in');
    expect(screen.getByTestId('recent')).toHaveTextContent(/^$/);
  });

  it('forgets the times when switching to another Google account', async () => {
    const { cognito, tap } = await renderApp();
    await tap('sign-in');
    await tap('use-45');
    cognito.next = GRACE;
    await tap('sign-in');
    expect(screen.getByTestId('recent')).toHaveTextContent(/^$/);
  });

  it('forgets the times when leaving a Google account for no account', async () => {
    const { tap } = await renderApp();
    await tap('sign-in');
    await tap('use-45');
    await tap('go-local');
    expect(screen.getByTestId('recent')).toHaveTextContent(/^$/);
  });

  it('forgets the times when the Google account is deleted', async () => {
    const { tap } = await renderApp();
    await tap('sign-in');
    await tap('use-45');
    await tap('delete-account');
    expect(screen.getByTestId('recent')).toHaveTextContent(/^$/);
  });
});
