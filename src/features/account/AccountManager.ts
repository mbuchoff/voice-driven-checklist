import type { CognitoAuthClient, OAuthTokens } from './cognito';
import { CognitoSessionError } from './cognito';
import type { AccountPreferenceStore } from './preferences';
import type { RefreshTokenStore } from './refreshTokenStore';
import type {
  AccountState,
  GoogleIdentity,
  PersistedAccountPreference,
} from './types';

export type AccountActionResult = 'completed' | 'cancelled';

type StateListener = (state: AccountState) => void;

export class AccountManager {
  private currentState: AccountState = { status: 'loading' };
  private accessToken: string | null = null;
  private idToken: string | null = null;
  private initialization: Promise<void> | null = null;
  private accountActions: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<StateListener>();

  constructor(
    private readonly preferences: AccountPreferenceStore,
    private readonly refreshTokens: RefreshTokenStore,
    private readonly cognito: CognitoAuthClient,
  ) {}

  get state(): AccountState {
    return this.currentState;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  initialize(): Promise<void> {
    return (this.initialization ??= this.initializeOnce());
  }

  private async initializeOnce(): Promise<void> {
    const preference = await this.preferences.load();
    if (preference.mode === 'unselected') {
      await this.clearStoredCredentials();
      this.setState({ status: 'unselected' });
      return;
    }
    if (preference.mode === 'local') {
      await this.clearStoredCredentials();
      this.setState({ status: 'local' });
      return;
    }

    await this.restoreGoogleSession(preference.identity);
  }

  selectLocal(): Promise<void> {
    return this.runAccountAction(() => this.selectLocalOnce());
  }

  private async selectLocalOnce(): Promise<void> {
    const previousPreference = preferenceFromState(this.currentState);
    const previousSubject = googleSubject(this.currentState);
    const previousRefreshToken = previousSubject
      ? await this.refreshTokens.get(previousSubject)
      : null;

    try {
      await this.preferences.save({ mode: 'local' });
    } catch (error) {
      if (previousPreference) {
        await this.preferences.save(previousPreference);
      }
      throw error;
    }

    this.clearMemoryTokens();
    await this.clearStoredCredentials();
    this.setState({ status: 'local' });

    if (previousRefreshToken) {
      void this.cognito.revoke(previousRefreshToken).catch(() => {
        // Switching to local mode is complete even when best-effort revocation is offline.
      });
    }
  }

  signIn(): Promise<AccountActionResult> {
    return this.runAccountAction(() => this.signInOnce());
  }

  private async signInOnce(): Promise<AccountActionResult> {
    const result = await this.cognito.signIn();
    if (result.type === 'cancelled') return 'cancelled';

    const refreshToken = result.tokens.refreshToken;
    if (!refreshToken) {
      throw new Error('Cognito did not return a refresh token.');
    }

    const previousPreference = preferenceFromState(this.currentState);
    const previousSubject = googleSubject(this.currentState);
    const newSubject = result.identity.sub;
    const previousRefreshToken = previousSubject
      ? await this.refreshTokens.get(previousSubject)
      : null;
    const previousTokenForNewSubject =
      previousSubject === newSubject
        ? previousRefreshToken
        : await this.refreshTokens.get(newSubject);

    try {
      await this.refreshTokens.set(newSubject, refreshToken);
      await this.preferences.save({
        mode: 'google',
        identity: result.identity,
      });
    } catch (error) {
      await restoreRefreshToken(
        this.refreshTokens,
        newSubject,
        previousTokenForNewSubject,
      );
      if (previousPreference) {
        await this.preferences.save(previousPreference);
      }
      void this.cognito.revoke(refreshToken).catch(() => {
        // The new session was never committed locally; revocation is best effort.
      });
      throw error;
    }

    await this.clearOtherStoredCredentials(newSubject);
    this.rememberTokens(result.tokens);
    this.setState(activeGoogleState(result.identity));
    if (previousRefreshToken && previousRefreshToken !== refreshToken) {
      void this.cognito.revoke(previousRefreshToken).catch(() => {
        // The replacement session is committed; old-session revocation is best effort.
      });
    }
    return 'completed';
  }

  retryAuthentication(): Promise<AccountActionResult> {
    return this.runAccountAction(() => this.retryAuthenticationOnce());
  }

  private async retryAuthenticationOnce(): Promise<AccountActionResult> {
    if (
      this.currentState.status === 'google' &&
      this.currentState.sessionStatus === 'temporarily-unavailable'
    ) {
      await this.restoreGoogleSession(this.currentState.identity);
      return 'completed';
    }
    return this.signInOnce();
  }

  deleteAccount(): Promise<void> {
    return this.runAccountAction(() => this.deleteAccountOnce());
  }

  private async deleteAccountOnce(): Promise<void> {
    if (
      this.currentState.status !== 'google' ||
      this.currentState.sessionStatus !== 'active' ||
      !this.accessToken
    ) {
      throw new Error('Sign in again before deleting this Google account.');
    }

    const identity = this.currentState.identity;
    const subject = identity.sub;
    const refreshToken = await this.refreshTokens.get(subject);

    await this.preferences.save({ mode: 'local' });
    try {
      await this.refreshTokens.deleteAll();
    } catch (error) {
      await restoreRefreshToken(this.refreshTokens, subject, refreshToken);
      await this.preferences.save({ mode: 'google', identity });
      throw error;
    }

    try {
      await this.cognito.deleteUser(this.accessToken);
    } catch (error) {
      await restoreRefreshToken(this.refreshTokens, subject, refreshToken);
      await this.preferences.save({ mode: 'google', identity });
      throw error;
    }

    this.clearMemoryTokens();
    this.setState({ status: 'local' });
  }

  private async restoreGoogleSession(identity: GoogleIdentity): Promise<void> {
    let refreshToken: string | null;
    try {
      refreshToken = await this.refreshTokens.get(identity.sub);
    } catch {
      this.clearMemoryTokens();
      this.setState({
        status: 'google',
        identity,
        sessionStatus: 'temporarily-unavailable',
      });
      return;
    }
    if (!refreshToken) {
      await this.clearStoredCredentials();
      this.clearMemoryTokens();
      this.setState({
        status: 'google',
        identity,
        sessionStatus: 'reauth-required',
      });
      return;
    }

    try {
      const tokens = await this.cognito.refresh(refreshToken);
      if (tokens.refreshToken && tokens.refreshToken !== refreshToken) {
        await this.refreshTokens.set(identity.sub, tokens.refreshToken);
      }
      this.rememberTokens(tokens);
      await this.clearOtherStoredCredentials(identity.sub);
      this.setState(activeGoogleState(identity));
    } catch (error) {
      this.clearMemoryTokens();
      if (
        error instanceof CognitoSessionError &&
        error.kind === 'reauth-required'
      ) {
        try {
          await this.refreshTokens.deleteAll();
        } catch {
          // The invalid token cannot restore a session; retry cleanup later.
        }
        this.setState({
          status: 'google',
          identity,
          sessionStatus: 'reauth-required',
        });
        return;
      }

      this.setState({
        status: 'google',
        identity,
        sessionStatus: 'temporarily-unavailable',
      });
    }
  }

  private async clearStoredCredentials(): Promise<void> {
    try {
      await this.refreshTokens.deleteAll();
    } catch {
      // Local and unselected modes remain usable while cleanup retries next start.
    }
  }

  private async clearOtherStoredCredentials(subject: string): Promise<void> {
    try {
      await this.refreshTokens.deleteAllExcept(subject);
    } catch {
      // The current session is usable while stale credential cleanup retries later.
    }
  }

  private runAccountAction<T>(action: () => Promise<T>): Promise<T> {
    const result = this.accountActions.then(action, action);
    this.accountActions = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private rememberTokens(tokens: OAuthTokens): void {
    this.accessToken = tokens.accessToken;
    this.idToken = tokens.idToken;
  }

  private clearMemoryTokens(): void {
    this.accessToken = null;
    this.idToken = null;
  }

  private setState(state: AccountState): void {
    this.currentState = state;
    for (const listener of this.listeners) listener(state);
  }
}

function activeGoogleState(identity: GoogleIdentity): AccountState {
  return {
    status: 'google',
    identity,
    sessionStatus: 'active',
  };
}

function googleSubject(state: AccountState): string | null {
  return state.status === 'google' ? state.identity.sub : null;
}

function preferenceFromState(
  state: AccountState,
): PersistedAccountPreference | null {
  if (state.status === 'loading') return null;
  if (state.status === 'google') {
    return { mode: 'google', identity: state.identity };
  }
  return { mode: state.status };
}

async function restoreRefreshToken(
  store: RefreshTokenStore,
  subject: string,
  refreshToken: string | null,
): Promise<void> {
  if (refreshToken) {
    await store.set(subject, refreshToken);
  } else {
    await store.delete(subject);
  }
}
