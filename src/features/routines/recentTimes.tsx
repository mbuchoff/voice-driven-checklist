import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { useAccount } from '@/src/features/account/AccountProvider';
import { accountIdentity } from '@/src/features/account/identity';

import { TIMER_CHIP_COUNT } from './timers';

/**
 * Using a timer length moves it to the front of the recent ones. A step
 * offers at most TIMER_CHIP_COUNT times, so no more are kept.
 */
export function rememberTime(recent: readonly number[], seconds: number): number[] {
  return [seconds, ...recent.filter((time) => time !== seconds)].slice(0, TIMER_CHIP_COUNT);
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

/**
 * Recent times live only in memory, so they start empty each time the app
 * starts, and are forgotten whenever the account changes.
 */
export function RecentTimesProvider({
  account,
  initialTimes = [],
  children,
}: {
  /** The current account's identity (see accountIdentity); null before it first settles. */
  account: string | null;
  /** The times to start with; the app always starts with none. */
  initialTimes?: readonly number[];
  children: ReactNode;
}) {
  // The times and the account they belong to change together.
  const [held, setHeld] = useState<{ owner: string | null; times: readonly number[] }>(
    { owner: account, times: initialTimes },
  );
  if (account !== held.owner) {
    // Adjusting state while rendering, so a different account never sees the old times.
    setHeld({ owner: account, times: [] });
  }

  const recent = held.times;
  const value = useMemo<RecentTimes>(
    () => ({
      recent,
      remember: (seconds) =>
        setHeld((current) => ({ ...current, times: rememberTime(current.times, seconds) })),
    }),
    [recent],
  );
  return <RecentTimesContext.Provider value={value}>{children}</RecentTimesContext.Provider>;
}

export function AppRecentTimesProvider({ children }: { children: ReactNode }) {
  const { state } = useAccount();
  return <RecentTimesProvider account={accountIdentity(state)}>{children}</RecentTimesProvider>;
}
