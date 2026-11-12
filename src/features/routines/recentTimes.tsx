import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { useAccount } from '@/src/features/account/AccountProvider';
import type { AccountState } from '@/src/features/account/types';

/** How many recently used timer lengths the chips draw on. */
export const RECENT_TIME_LIMIT = 4;

/** Using a timer length moves it to the front of the recent ones. */
export function rememberTime(recent: readonly number[], seconds: number): number[] {
  return [seconds, ...recent.filter((time) => time !== seconds)].slice(0, RECENT_TIME_LIMIT);
}

type RecentTimes = {
  /** Timer lengths (seconds) used since the app started or the account last changed, most recent first. */
  recent: readonly number[];
  remember(seconds: number): void;
};

const RecentTimesContext = createContext<RecentTimes | null>(null);

export function useRecentTimes(): RecentTimes {
  const context = useContext(RecentTimesContext);
  if (!context) throw new Error('useRecentTimes must be used within a RecentTimesProvider.');
  return context;
}

/** Who is using the app, or null while that isn't settled. */
function accountKey(state: AccountState): string | null {
  if (state.status === 'local') return 'local';
  if (state.status === 'google') return `google:${state.identity.sub}`;
  return null;
}

/**
 * Recent times live only in memory, so they start empty each time the app
 * starts. They are also forgotten when the account becomes a different one;
 * moments when the account isn't settled (loading, unselected) don't count
 * as a change.
 */
export function RecentTimesProvider({
  account,
  initialTimes = [],
  children,
}: {
  /** Identifies the current account; null while it isn't settled. */
  account: string | null;
  /** The times to start with; the app always starts with none. */
  initialTimes?: readonly number[];
  children: ReactNode;
}) {
  const [recent, setRecent] = useState<readonly number[]>(initialTimes);
  const [owner, setOwner] = useState<string | null>(account);
  if (account !== null && account !== owner) {
    // Adjusting state while rendering, so a different account never sees the old times.
    setOwner(account);
    if (owner !== null) setRecent([]);
  }

  const value = useMemo<RecentTimes>(
    () => ({
      recent,
      remember: (seconds) => setRecent((current) => rememberTime(current, seconds)),
    }),
    [recent],
  );
  return <RecentTimesContext.Provider value={value}>{children}</RecentTimesContext.Provider>;
}

export function AppRecentTimesProvider({ children }: { children: ReactNode }) {
  const { state } = useAccount();
  return <RecentTimesProvider account={accountKey(state)}>{children}</RecentTimesProvider>;
}
