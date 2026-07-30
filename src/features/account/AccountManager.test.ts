import {
  createChecklist,
  getChecklist,
} from '@/src/features/checklists/repository';
import { runMigrations } from '@/src/db/migrations';
import { createTestDatabase } from '@/src/test/createTestDatabase';

import { AccountManager } from './AccountManager';
import type {
  CognitoAuthClient,
  InteractiveSignInResult,
  OAuthTokens,
} from './cognito';
import { CognitoSessionError } from './cognito';
import {
  MemoryAccountPreferenceStore,
  SqliteAccountPreferenceStore,
} from './preferences';
import { MemoryRefreshTokenStore } from './refreshTokenStore';
import type { GoogleIdentity } from './types';

const ADA: GoogleIdentity = {
  sub: 'ada-sub',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
};

const GRACE: GoogleIdentity = {
  sub: 'grace-sub',
  displayName: 'Grace Hopper',
  email: 'grace@example.com',
};

const ADA_TOKENS: OAuthTokens = {
  accessToken: 'ada-access',
  idToken: 'ada-id',
  refreshToken: 'ada-refresh',
};

class FakeCognitoAuthClient implements CognitoAuthClient {
  signInResult: InteractiveSignInResult = {
    type: 'success',
    identity: ADA,
    tokens: ADA_TOKENS,
  };
  signInError: Error | null = null;
  refreshResult: OAuthTokens = {
    accessToken: 'restored-access',
    idToken: 'restored-id',
    refreshToken: 'rotated-refresh',
  };
  refreshError: Error | null = null;
  revokeError: Error | null = null;
  deleteError: Error | null = null;

  signInCount = 0;
  refreshCalls: string[] = [];
  revokeCalls: string[] = [];
  deleteCalls: string[] = [];

  async signIn(): Promise<InteractiveSignInResult> {
    this.signInCount += 1;
    if (this.signInError) throw this.signInError;
    return this.signInResult;
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    this.refreshCalls.push(refreshToken);
    if (this.refreshError) throw this.refreshError;
    return this.refreshResult;
  }

  async revoke(refreshToken: string): Promise<void> {
    this.revokeCalls.push(refreshToken);
    if (this.revokeError) throw this.revokeError;
  }

  async deleteUser(accessToken: string): Promise<void> {
    this.deleteCalls.push(accessToken);
    if (this.deleteError) throw this.deleteError;
  }
}

function createManager(options?: {
  preference?: ConstructorParameters<typeof MemoryAccountPreferenceStore>[0];
  refreshToken?: string | null;
  client?: FakeCognitoAuthClient;
}) {
  const preferences = new MemoryAccountPreferenceStore(
    options?.preference ?? { mode: 'unselected' },
  );
  const refreshTokens = new MemoryRefreshTokenStore(options?.refreshToken);
  const client = options?.client ?? new FakeCognitoAuthClient();
  const manager = new AccountManager(preferences, refreshTokens, client);
  return { manager, preferences, refreshTokens, client };
}

describe('AccountManager', () => {
  it('restores the fresh-install selection state', async () => {
    const { manager } = createManager();

    await manager.initialize();

    expect(manager.state).toEqual({ status: 'unselected' });
  });

  it('selects local mode without contacting Cognito and restores it after restart', async () => {
    const { manager, preferences, refreshTokens, client } = createManager();
    await manager.initialize();

    await manager.selectLocal();

    expect(manager.state).toEqual({ status: 'local' });
    expect(client.signInCount).toBe(0);
    expect(client.refreshCalls).toEqual([]);
    const restarted = new AccountManager(preferences, refreshTokens, client);
    await restarted.initialize();
    expect(restarted.state).toEqual({ status: 'local' });
  });

  it('commits an initial Google sign-in only after identity and tokens succeed', async () => {
    const { manager, preferences, refreshTokens } = createManager();
    await manager.initialize();

    await expect(manager.signIn()).resolves.toBe('completed');

    expect(manager.state).toEqual({
      status: 'google',
      identity: ADA,
      sessionStatus: 'active',
    });
    await expect(preferences.load()).resolves.toEqual({
      mode: 'google',
      identity: ADA,
    });
    await expect(refreshTokens.get()).resolves.toBe('ada-refresh');
  });

  it('leaves first-run state unchanged when interactive sign-in is cancelled', async () => {
    const client = new FakeCognitoAuthClient();
    client.signInResult = { type: 'cancelled' };
    const { manager, preferences, refreshTokens } = createManager({ client });
    await manager.initialize();

    await expect(manager.signIn()).resolves.toBe('cancelled');

    expect(manager.state).toEqual({ status: 'unselected' });
    await expect(preferences.load()).resolves.toEqual({ mode: 'unselected' });
    await expect(refreshTokens.get()).resolves.toBeNull();
  });

  it('leaves local mode unchanged when interactive sign-in fails', async () => {
    const client = new FakeCognitoAuthClient();
    client.signInError = new Error('provider unavailable');
    const { manager, preferences, refreshTokens } = createManager({
      preference: { mode: 'local' },
      client,
    });
    await manager.initialize();

    await expect(manager.signIn()).rejects.toThrow('provider unavailable');

    expect(manager.state).toEqual({ status: 'local' });
    await expect(preferences.load()).resolves.toEqual({ mode: 'local' });
    await expect(refreshTokens.get()).resolves.toBeNull();
  });

  it('rotates the refresh token while restoring a Google session', async () => {
    const { manager, refreshTokens, client } = createManager({
      preference: { mode: 'google', identity: ADA },
      refreshToken: 'original-refresh',
    });

    await manager.initialize();

    expect(client.refreshCalls).toEqual(['original-refresh']);
    await expect(refreshTokens.get()).resolves.toBe('rotated-refresh');
    expect(manager.state).toEqual({
      status: 'google',
      identity: ADA,
      sessionStatus: 'active',
    });
  });

  it('restores a session only once when initialization is requested concurrently', async () => {
    const { manager, client } = createManager({
      preference: { mode: 'google', identity: ADA },
      refreshToken: 'original-refresh',
    });

    await Promise.all([manager.initialize(), manager.initialize()]);

    expect(client.refreshCalls).toEqual(['original-refresh']);
  });

  it('keeps cached identity and credentials when refresh is temporarily unavailable', async () => {
    const client = new FakeCognitoAuthClient();
    client.refreshError = new CognitoSessionError(
      'temporarily-unavailable',
      'network unavailable',
    );
    const { manager, refreshTokens } = createManager({
      preference: { mode: 'google', identity: ADA },
      refreshToken: 'original-refresh',
      client,
    });

    await manager.initialize();

    expect(manager.state).toEqual({
      status: 'google',
      identity: ADA,
      sessionStatus: 'temporarily-unavailable',
    });
    await expect(refreshTokens.get()).resolves.toBe('original-refresh');
  });

  it('clears an invalid refresh token while retaining identity for reauthentication', async () => {
    const client = new FakeCognitoAuthClient();
    client.refreshError = new CognitoSessionError(
      'reauth-required',
      'refresh token revoked',
    );
    const { manager, preferences, refreshTokens } = createManager({
      preference: { mode: 'google', identity: ADA },
      refreshToken: 'revoked-refresh',
      client,
    });

    await manager.initialize();

    expect(manager.state).toEqual({
      status: 'google',
      identity: ADA,
      sessionStatus: 'reauth-required',
    });
    await expect(refreshTokens.get()).resolves.toBeNull();
    await expect(preferences.load()).resolves.toEqual({
      mode: 'google',
      identity: ADA,
    });
  });

  it('requires reauthentication when a Google preference has no refresh token', async () => {
    const { manager, client } = createManager({
      preference: { mode: 'google', identity: ADA },
    });

    await manager.initialize();

    expect(client.refreshCalls).toEqual([]);
    expect(manager.state).toMatchObject({
      status: 'google',
      identity: ADA,
      sessionStatus: 'reauth-required',
    });
  });

  it('preserves the previous Google account and session when account switching is cancelled', async () => {
    const client = new FakeCognitoAuthClient();
    const { manager, preferences, refreshTokens } = createManager({
      preference: { mode: 'google', identity: ADA },
      refreshToken: 'ada-refresh',
      client,
    });
    await manager.initialize();
    client.signInResult = { type: 'cancelled' };

    await expect(manager.signIn()).resolves.toBe('cancelled');

    expect(manager.state).toMatchObject({
      status: 'google',
      identity: ADA,
      sessionStatus: 'active',
    });
    await expect(preferences.load()).resolves.toEqual({
      mode: 'google',
      identity: ADA,
    });
    await expect(refreshTokens.get()).resolves.toBe('rotated-refresh');
  });

  it('preserves the previous Google account and usable session when account switching fails', async () => {
    const client = new FakeCognitoAuthClient();
    const { manager, preferences, refreshTokens } = createManager({
      preference: { mode: 'google', identity: ADA },
      refreshToken: 'ada-refresh',
      client,
    });
    await manager.initialize();
    client.signInError = new Error('provider unavailable');

    await expect(manager.signIn()).rejects.toThrow('provider unavailable');

    expect(manager.state).toEqual({
      status: 'google',
      identity: ADA,
      sessionStatus: 'active',
    });
    await expect(preferences.load()).resolves.toEqual({
      mode: 'google',
      identity: ADA,
    });
    await expect(refreshTokens.get()).resolves.toBe('rotated-refresh');

    await manager.deleteAccount();
    expect(client.deleteCalls).toEqual(['restored-access']);
  });

  it('switches atomically from one Google account to another', async () => {
    const client = new FakeCognitoAuthClient();
    const { manager, preferences, refreshTokens } = createManager({
      preference: { mode: 'google', identity: ADA },
      refreshToken: 'ada-refresh',
      client,
    });
    await manager.initialize();
    client.signInResult = {
      type: 'success',
      identity: GRACE,
      tokens: {
        accessToken: 'grace-access',
        idToken: 'grace-id',
        refreshToken: 'grace-refresh',
      },
    };

    await manager.signIn();

    expect(manager.state).toEqual({
      status: 'google',
      identity: GRACE,
      sessionStatus: 'active',
    });
    await expect(preferences.load()).resolves.toEqual({
      mode: 'google',
      identity: GRACE,
    });
    await expect(refreshTokens.get()).resolves.toBe('grace-refresh');
    expect(client.revokeCalls).toEqual(['rotated-refresh']);
  });

  it('switches to local mode, clears credentials, and preserves checklists when revocation is offline', async () => {
    const database = createTestDatabase();
    await runMigrations(database);
    const checklist = await createChecklist(database, {
      title: 'Keep me',
      items: [{ text: 'Still here' }],
    });
    const preferences = new SqliteAccountPreferenceStore(database);
    await preferences.save({ mode: 'google', identity: ADA });
    const refreshTokens = new MemoryRefreshTokenStore('ada-refresh');
    const client = new FakeCognitoAuthClient();
    client.revokeError = new Error('offline');
    const manager = new AccountManager(preferences, refreshTokens, client);
    await manager.initialize();

    await manager.selectLocal();

    expect(manager.state).toEqual({ status: 'local' });
    await expect(refreshTokens.get()).resolves.toBeNull();
    await expect(preferences.load()).resolves.toEqual({ mode: 'local' });
    expect(client.revokeCalls).toEqual(['rotated-refresh']);
    await expect(getChecklist(database, checklist.id)).resolves.toMatchObject({
      title: 'Keep me',
      items: [{ text: 'Still here' }],
    });
  });

  it('keeps the account and session intact when account deletion fails', async () => {
    const client = new FakeCognitoAuthClient();
    client.deleteError = new Error('deletion refused');
    const { manager, preferences, refreshTokens } = createManager({
      preference: { mode: 'google', identity: ADA },
      refreshToken: 'ada-refresh',
      client,
    });
    await manager.initialize();

    await expect(manager.deleteAccount()).rejects.toThrow('deletion refused');

    expect(client.deleteCalls).toEqual(['restored-access']);
    expect(manager.state).toMatchObject({
      status: 'google',
      identity: ADA,
      sessionStatus: 'active',
    });
    await expect(preferences.load()).resolves.toEqual({
      mode: 'google',
      identity: ADA,
    });
    await expect(refreshTokens.get()).resolves.toBe('rotated-refresh');
  });

  it('deletes the Cognito user before entering local mode without touching checklists', async () => {
    const database = createTestDatabase();
    await runMigrations(database);
    const checklist = await createChecklist(database, {
      title: 'Local data',
      items: [{ text: 'Preserved' }],
    });
    const preferences = new SqliteAccountPreferenceStore(database);
    await preferences.save({ mode: 'google', identity: ADA });
    const refreshTokens = new MemoryRefreshTokenStore('ada-refresh');
    const client = new FakeCognitoAuthClient();
    const manager = new AccountManager(preferences, refreshTokens, client);
    await manager.initialize();

    await manager.deleteAccount();

    expect(client.deleteCalls).toEqual(['restored-access']);
    expect(manager.state).toEqual({ status: 'local' });
    await expect(refreshTokens.get()).resolves.toBeNull();
    await expect(preferences.load()).resolves.toEqual({ mode: 'local' });
    await expect(getChecklist(database, checklist.id)).resolves.toMatchObject({
      title: 'Local data',
      items: [{ text: 'Preserved' }],
    });
  });
});
