import * as AuthSession from 'expo-auth-session';

import type {
  CognitoAuthClient,
  InteractiveSignInResult,
  OAuthTokens,
} from './cognito';
import { CognitoSessionError } from './cognito';
import type { GoogleIdentity } from './types';

export type AuthorizationRequest = {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  identityProvider: 'Google';
  prompt: 'select_account';
  usePkce: true;
};

export type AuthorizationResult =
  | { type: 'cancelled' }
  | { type: 'success'; code: string; codeVerifier: string };

export interface AuthorizationCodeBrowser {
  authorize(request: AuthorizationRequest): Promise<AuthorizationResult>;
}

export type TokenExchangeRequest = {
  tokenEndpoint: string;
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
};

export type TokenRefreshRequest = {
  tokenEndpoint: string;
  clientId: string;
  refreshToken: string;
};

export type TokenRevocationRequest = {
  revocationEndpoint: string;
  clientId: string;
  refreshToken: string;
};

export interface OAuthProtocol {
  exchange(request: TokenExchangeRequest): Promise<OAuthTokens>;
  refresh(request: TokenRefreshRequest): Promise<OAuthTokens>;
  revoke(request: TokenRevocationRequest): Promise<void>;
  userInfo(endpoint: string, accessToken: string): Promise<Record<string, unknown>>;
}

export type CognitoClientConfig = {
  region: string;
  userPoolId: string;
  domain: string;
  clientId: string;
  redirectUri: string;
};

type FetchResponse = {
  ok: boolean;
  json(): Promise<unknown>;
};

type FetchRequest = (
  input: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  },
) => Promise<FetchResponse>;

const SCOPES = [
  'openid',
  'email',
  'profile',
  'aws.cognito.signin.user.admin',
];

export class CognitoAuthSessionClient implements CognitoAuthClient {
  private readonly domain: string;

  constructor(
    private readonly config: CognitoClientConfig,
    private readonly browser: AuthorizationCodeBrowser = new ExpoAuthorizationCodeBrowser(),
    private readonly protocol: OAuthProtocol = expoOAuthProtocol,
    private readonly fetchRequest: FetchRequest = globalThis.fetch as FetchRequest,
  ) {
    this.domain = config.domain.replace(/\/+$/, '');
  }

  async signIn(): Promise<InteractiveSignInResult> {
    const authorization = await this.browser.authorize({
      authorizationEndpoint: `${this.domain}/oauth2/authorize`,
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      scopes: SCOPES,
      identityProvider: 'Google',
      prompt: 'select_account',
      usePkce: true,
    });
    if (authorization.type === 'cancelled') return authorization;

    const tokens = await this.protocol.exchange({
      tokenEndpoint: `${this.domain}/oauth2/token`,
      clientId: this.config.clientId,
      code: authorization.code,
      codeVerifier: authorization.codeVerifier,
      redirectUri: this.config.redirectUri,
    });
    if (!tokens.refreshToken) {
      throw new Error('Cognito did not return a refresh token.');
    }

    const userInfo = await this.protocol.userInfo(
      `${this.domain}/oauth2/userInfo`,
      tokens.accessToken,
    );

    return {
      type: 'success',
      identity: parseIdentity(userInfo),
      tokens,
    };
  }

  async refresh(refreshToken: string): Promise<OAuthTokens> {
    try {
      return await this.protocol.refresh({
        tokenEndpoint: `${this.domain}/oauth2/token`,
        clientId: this.config.clientId,
        refreshToken,
      });
    } catch (error) {
      if (requiresReauthentication(error)) {
        throw new CognitoSessionError(
          'reauth-required',
          'The Google session is expired or no longer valid.',
        );
      }
      throw new CognitoSessionError(
        'temporarily-unavailable',
        'The Google session could not be refreshed right now.',
      );
    }
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.protocol.revoke({
      revocationEndpoint: `${this.domain}/oauth2/revoke`,
      clientId: this.config.clientId,
      refreshToken,
    });
  }

  async deleteUser(accessToken: string): Promise<void> {
    const response = await this.fetchRequest(
      `https://cognito-idp.${this.config.region}.amazonaws.com/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.DeleteUser',
        },
        body: JSON.stringify({ AccessToken: accessToken }),
      },
    );
    if (response.ok) return;

    const body = await readErrorResponse(response);
    throw new Error(body.message ?? 'Cognito account deletion failed.');
  }
}

export class ExpoAuthorizationCodeBrowser implements AuthorizationCodeBrowser {
  async authorize(options: AuthorizationRequest): Promise<AuthorizationResult> {
    const request = new AuthSession.AuthRequest({
      clientId: options.clientId,
      redirectUri: options.redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes: options.scopes,
      prompt: AuthSession.Prompt.SelectAccount,
      usePKCE: options.usePkce,
      codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
      extraParams: {
        identity_provider: options.identityProvider,
      },
    });

    const result = await request.promptAsync({
      authorizationEndpoint: options.authorizationEndpoint,
    });
    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { type: 'cancelled' };
    }
    if (result.type !== 'success') {
      const description =
        'params' in result
          ? result.params.error_description ?? result.params.error
          : null;
      throw new Error(description ?? 'Google sign-in did not complete.');
    }

    const code = result.params.code;
    if (!code || !request.codeVerifier) {
      throw new Error('Google sign-in returned an incomplete authorization response.');
    }
    return {
      type: 'success',
      code,
      codeVerifier: request.codeVerifier,
    };
  }
}

const expoOAuthProtocol: OAuthProtocol = {
  async exchange(request) {
    const response = await AuthSession.exchangeCodeAsync(
      {
        clientId: request.clientId,
        code: request.code,
        redirectUri: request.redirectUri,
        extraParams: {
          code_verifier: request.codeVerifier,
        },
      },
      { tokenEndpoint: request.tokenEndpoint },
    );
    return normalizeTokens(response);
  },

  async refresh(request) {
    const response = await AuthSession.refreshAsync(
      {
        clientId: request.clientId,
        refreshToken: request.refreshToken,
      },
      { tokenEndpoint: request.tokenEndpoint },
    );
    return normalizeTokens(response);
  },

  async revoke(request) {
    await AuthSession.revokeAsync(
      {
        clientId: request.clientId,
        token: request.refreshToken,
        tokenTypeHint: AuthSession.TokenTypeHint.RefreshToken,
      },
      { revocationEndpoint: request.revocationEndpoint },
    );
  },

  userInfo(endpoint, accessToken) {
    return AuthSession.fetchUserInfoAsync(
      { accessToken },
      { userInfoEndpoint: endpoint },
    );
  },
};

function normalizeTokens(response: AuthSession.TokenResponse): OAuthTokens {
  return {
    accessToken: response.accessToken,
    idToken: response.idToken ?? null,
    refreshToken: response.refreshToken ?? null,
  };
}

function parseIdentity(userInfo: Record<string, unknown>): GoogleIdentity {
  if (typeof userInfo.sub !== 'string' || !userInfo.sub) {
    throw new Error('Cognito user info is missing its subject.');
  }
  return {
    sub: userInfo.sub,
    displayName:
      typeof userInfo.name === 'string' && userInfo.name ? userInfo.name : null,
    email:
      typeof userInfo.email === 'string' && userInfo.email ? userInfo.email : null,
  };
}

function requiresReauthentication(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & {
    code?: string;
    params?: Record<string, unknown>;
  };
  const values = [
    candidate.name,
    candidate.code,
    candidate.message,
    candidate.params?.error,
    candidate.params?.__type,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  return /invalid[_ -]?grant|notauthorized|revok|expired/i.test(values);
}

async function readErrorResponse(
  response: FetchResponse,
): Promise<{ message?: string }> {
  try {
    const body = await response.json();
    if (body && typeof body === 'object') {
      const message = (body as { message?: unknown }).message;
      if (typeof message === 'string') return { message };
    }
  } catch {
    // Cognito can return an empty or non-JSON error response.
  }
  return {};
}
