import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useDatabase } from '@/src/db/DatabaseProvider';

import {
  AccountManager,
  type AccountActionResult,
} from './AccountManager';
import { createCognitoAuthClient } from './config';
import { SqliteAccountPreferenceStore } from './preferences';
import { createRefreshTokenStore } from './refreshTokenStore';
import type { AccountState } from './types';

export type AccountContextValue = {
  state: AccountState;
  selectLocal(): Promise<void>;
  signIn(): Promise<AccountActionResult>;
  switchGoogleAccount(): Promise<AccountActionResult>;
  retryAuthentication(): Promise<AccountActionResult>;
  deleteAccount(): Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccount(): AccountContextValue {
  const account = useContext(AccountContext);
  if (!account) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return account;
}

export function AccountProvider({
  manager,
  children,
}: {
  manager: AccountManager;
  children: ReactNode;
}) {
  const [state, setState] = useState<AccountState>(manager.state);
  const [initializationError, setInitializationError] =
    useState<unknown>(null);

  useEffect(() => {
    const unsubscribe = manager.subscribe(setState);
    void manager.initialize().catch(setInitializationError);
    return unsubscribe;
  }, [manager]);

  if (initializationError) {
    throw initializationError;
  }

  const value = useMemo<AccountContextValue>(
    () => ({
      state,
      selectLocal: () => manager.selectLocal(),
      signIn: () => manager.signIn(),
      switchGoogleAccount: () => manager.signIn(),
      retryAuthentication: () => manager.retryAuthentication(),
      deleteAccount: () => manager.deleteAccount(),
    }),
    [manager, state],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

export function AppAccountProvider({ children }: { children: ReactNode }) {
  const database = useDatabase();
  const manager = useMemo(
    () =>
      new AccountManager(
        new SqliteAccountPreferenceStore(database),
        createRefreshTokenStore(),
        createCognitoAuthClient(),
      ),
    [database],
  );
  return <AccountProvider manager={manager}>{children}</AccountProvider>;
}
