import type { AccountState } from './types';

/**
 * Who is using the app: 'local', or 'google:<subject>' for a Google account,
 * or null before the account first settles (loading, or not yet chosen).
 * Changes in a Google session's status keep the same identity.
 */
export function accountIdentity(state: AccountState): string | null {
  if (state.status === 'local') return 'local';
  if (state.status === 'google') return `google:${state.identity.sub}`;
  return null;
}
