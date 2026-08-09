import type {
  AuthorizationCodeBrowser,
  AuthorizationRequest,
  AuthorizationResult,
  OAuthProtocol,
  TokenExchangeRequest,
  TokenRefreshRequest,
  TokenRevocationRequest,
} from './cognitoAuthClient';
import { CognitoAuthSessionClient } from './cognitoAuthClient';

class FakeAuthorizationCodeBrowser implements AuthorizationCodeBrowser {
  result: AuthorizationResult = {
    type: 'success',
    code: 'authorization-code',
    codeVerifier: 'pkce-verifier',
  };
  requests: AuthorizationRequest[] = [];

  async authorize(request: AuthorizationRequest): Promise<AuthorizationResult> {
    this.requests.push(request);
    return this.result;
  }
}

class FakeOAuthProtocol implements OAuthProtocol {
  exchangeResult = {
    accessToken: 'access-token',
    idToken: 'id-token',
    refreshToken: 'refresh-token',
  };
  refreshResult = {
    accessToken: 'refreshed-access',
    idToken: 'refreshed-id',
    refreshToken: 'rotated-refresh',
  };
  userInfoResult: Record<string, unknown> = {
    sub: 'cognito-subject',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
  };
  exchangeError: Error | null = null;
  refreshError: Error | null = null;
  revokeError: Error | null = null;
  exchangeRequests: TokenExchangeRequest[] = [];
  refreshRequests: TokenRefreshRequest[] = [];
  revokeRequests: TokenRevocationRequest[] = [];
  userInfoCalls: { endpoint: string; accessToken: string }[] = [];

  async exchange(request: TokenExchangeRequest) {
    this.exchangeRequests.push(request);
    if (this.exchangeError) throw this.exchangeError;
    return this.exchangeResult;
  }

  async refresh(request: TokenRefreshRequest) {
    this.refreshRequests.push(request);
    if (this.refreshError) throw this.refreshError;
    return this.refreshResult;
  }

  async revoke(request: TokenRevocationRequest): Promise<void> {
    this.revokeRequests.push(request);
    if (this.revokeError) throw this.revokeError;
  }

  async userInfo(endpoint: string, accessToken: string) {
    this.userInfoCalls.push({ endpoint, accessToken });
    return this.userInfoResult;
  }
}

const CONFIG = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_example',
  domain: 'https://voice-checklist-dev.auth.us-east-1.amazoncognito.com/',
  clientId: 'public-client-id',
  redirectUri: 'voicechecklist://auth/callback',
};

function setup() {
  const browser = new FakeAuthorizationCodeBrowser();
  const protocol = new FakeOAuthProtocol();
  const fetch = jest.fn();
  const client = new CognitoAuthSessionClient(CONFIG, browser, protocol, fetch);
  return { browser, protocol, fetch, client };
}

describe('CognitoAuthSessionClient', () => {
  it('signs in through Google with authorization code and PKCE, then loads identity', async () => {
    const { browser, protocol, client } = setup();

    await expect(client.signIn()).resolves.toEqual({
      type: 'success',
      identity: {
        sub: 'cognito-subject',
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
      },
      tokens: {
        accessToken: 'access-token',
        idToken: 'id-token',
        refreshToken: 'refresh-token',
      },
    });

    expect(browser.requests).toEqual([
      {
        authorizationEndpoint:
          'https://voice-checklist-dev.auth.us-east-1.amazoncognito.com/oauth2/authorize',
        clientId: 'public-client-id',
        redirectUri: 'voicechecklist://auth/callback',
        scopes: [
          'openid',
          'email',
          'profile',
          'aws.cognito.signin.user.admin',
        ],
        identityProvider: 'Google',
        prompt: 'select_account',
        usePkce: true,
      },
    ]);
    expect(protocol.exchangeRequests).toEqual([
      {
        tokenEndpoint:
          'https://voice-checklist-dev.auth.us-east-1.amazoncognito.com/oauth2/token',
        clientId: 'public-client-id',
        code: 'authorization-code',
        codeVerifier: 'pkce-verifier',
        redirectUri: 'voicechecklist://auth/callback',
      },
    ]);
    expect(protocol.userInfoCalls).toEqual([
      {
        endpoint:
          'https://voice-checklist-dev.auth.us-east-1.amazoncognito.com/oauth2/userInfo',
        accessToken: 'access-token',
      },
    ]);
  });

  it('returns cancellation without exchanging a code', async () => {
    const { browser, protocol, client } = setup();
    browser.result = { type: 'cancelled' };

    await expect(client.signIn()).resolves.toEqual({ type: 'cancelled' });

    expect(protocol.exchangeRequests).toEqual([]);
    expect(protocol.userInfoCalls).toEqual([]);
  });

  it('returns rotated tokens from the refresh grant', async () => {
    const { protocol, client } = setup();

    await expect(client.refresh('current-refresh')).resolves.toEqual({
      accessToken: 'refreshed-access',
      idToken: 'refreshed-id',
      refreshToken: 'rotated-refresh',
    });

    expect(protocol.refreshRequests).toEqual([
      {
        tokenEndpoint:
          'https://voice-checklist-dev.auth.us-east-1.amazoncognito.com/oauth2/token',
        clientId: 'public-client-id',
        refreshToken: 'current-refresh',
      },
    ]);
  });

  it('classifies network refresh failures without invalidating the session', async () => {
    const { protocol, client } = setup();
    protocol.refreshError = new TypeError('Network request failed');

    await expect(client.refresh('current-refresh')).rejects.toMatchObject({
      name: 'CognitoSessionError',
      kind: 'temporarily-unavailable',
    });
  });

  it('classifies an invalid refresh grant as requiring reauthentication', async () => {
    const { protocol, client } = setup();
    protocol.refreshError = Object.assign(new Error('invalid_grant'), {
      code: 'ERR_TOKEN_INVALID_GRANT',
      params: { error: 'invalid_grant' },
    });

    await expect(client.refresh('current-refresh')).rejects.toEqual(
      expect.objectContaining({
        name: 'CognitoSessionError',
        kind: 'reauth-required',
      }),
    );
  });

  it('revokes the refresh token through the Cognito OAuth endpoint', async () => {
    const { protocol, client } = setup();

    await client.revoke('refresh-token');

    expect(protocol.revokeRequests).toEqual([
      {
        revocationEndpoint:
          'https://voice-checklist-dev.auth.us-east-1.amazoncognito.com/oauth2/revoke',
        clientId: 'public-client-id',
        refreshToken: 'refresh-token',
      },
    ]);
  });

  it('deletes the current Cognito user with its access token', async () => {
    const { fetch, client } = setup();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await client.deleteUser('access-token');

    expect(fetch).toHaveBeenCalledWith(
      'https://cognito-idp.us-east-1.amazonaws.com/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.DeleteUser',
        },
        body: JSON.stringify({ AccessToken: 'access-token' }),
      },
    );
  });

  it('reports account deletion failure without treating it as success', async () => {
    const { fetch, client } = setup();
    fetch.mockResolvedValue({
      ok: false,
      json: async () => ({
        __type: 'NotAuthorizedException',
        message: 'Access token is invalid',
      }),
    });

    await expect(client.deleteUser('access-token')).rejects.toThrow(
      'Access token is invalid',
    );
  });

  it('rejects user info that has no Cognito subject', async () => {
    const { protocol, client } = setup();
    protocol.userInfoResult = {
      name: 'Missing identifier',
      email: 'missing@example.com',
    };

    await expect(client.signIn()).rejects.toThrow(/subject/i);
  });
});
