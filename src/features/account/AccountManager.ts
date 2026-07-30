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
      this.setState({ status: 'unselected' });
      return;
    }
    if (preference.mode === 'local') {
      this.setState({ status: 'local' });
      return;
    }

    await this.restoreGoogleSession(preference.identity);
  }

  async selectLocal(): Promise<void> {
    const previousPreference = preferenceFromState(this.currentState);
    const previousRefreshToken = await this.refreshTokens.get();

    await this.refreshTokens.delete();
    try {
      await this.preferences.save({ mode: 'local' });
    } catch (error) {
      await restoreRefreshToken(this.refreshTokens, previousRefreshToken);
      if (previousPreference) {
        await this.preferences.save(previousPreference);
      }
      throw error;
    }

    this.clearMemoryTokens();
    this.setState({ status: 'local' });

    if (previousRefreshToken) {
      void this.cognito.revoke(previousRefreshToken).catch(() => {
        // Switching to local mode is complete even when best-effort revocation is offline.
      });
    }
  }

  async signIn(): Promise<AccountActionResult> {
    const result = await this.cognito.signIn();
    if (result.type === 'cancelled') return 'cancelled';

    const refreshToken = result.tokens.refreshToken;
    if (!refreshToken) {
      throw new Error('Cognito did not return a refresh token.');
    }

    const previousPreference = preferenceFromState(this.currentState);
    const previousRefreshToken = await this.refreshTokens.get();

    try {
      await this.refreshTokens.set(refreshToken);
      await this.preferences.save({
        mode: 'google',
        identity: result.identity,
      });
    } catch (error) {
      await restoreRefreshToken(this.refreshTokens, previousRefreshToken);
      if (previousPreference) {
        await this.preferences.save(previousPreference);
      }
      void this.cognito.revoke(refreshToken).catch(() => {
        // The new session was never committed locally; revocation is best effort.
      });
      throw error;
    }

    this.rememberTokens(result.tokens);
    this.setState(activeGoogleState(result.identity));
    if (previousRefreshToken && previousRefreshToken !== refreshToken) {
      void this.cognito.revoke(previousRefreshToken).catch(() => {
        // The replacement session is committed; old-session revocation is best effort.
      });
    }
    return 'completed';
  }

  async retryAuthentication(): Promise<AccountActionResult> {
    if (
      this.currentState.status === 'google' &&
      this.currentState.sessionStatus === 'temporarily-unavailable'
    ) {
      await this.restoreGoogleSession(this.currentState.identity);
      return 'completed';
    }
    return this.signIn();
  }

  async deleteAccount(): Promise<void> {
    if (
      this.currentState.status !== 'google' ||
      this.currentState.sessionStatus !== 'active' ||
      !this.accessToken
    ) {
      throw new Error('Sign in again before deleting this Google account.');
    }

    await this.cognito.deleteUser(this.accessToken);
    await this.refreshTokens.delete();
    await this.preferences.save({ mode: 'local' });
    this.clearMemoryTokens();
    this.setState({ status: 'local' });
  }

  private async restoreGoogleSession(identity: GoogleIdentity): Promise<void> {
    const refreshToken = await this.refreshTokens.get();
    if (!refreshToken) {
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
        await this.refreshTokens.set(tokens.refreshToken);
      }
      this.rememberTokens(tokens);
      this.setState(activeGoogleState(identity));
    } catch (error) {
      this.clearMemoryTokens();
      if (
        error instanceof CognitoSessionError &&
        error.kind === 'reauth-required'
      ) {
        await this.refreshTokens.delete();
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
  refreshToken: string | null,
): Promise<void> {
  if (refreshToken) {
    await store.set(refreshToken);
  } else {
    await store.delete();
  }
}
