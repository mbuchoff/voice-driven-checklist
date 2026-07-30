import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';

import type {
  CognitoAuthClient,
  InteractiveSignInResult,
  OAuthTokens,
} from './cognito';
import { CognitoSessionError } from './cognito';
import {
  CognitoAuthSessionClient,
  type CognitoClientConfig,
} from './cognitoAuthClient';

export type PublicCognitoConfig = {
  region?: unknown;
  userPoolId?: unknown;
  domain?: unknown;
  androidClientId?: unknown;
  webClientId?: unknown;
};

export function resolveCognitoClientConfig(
  config: PublicCognitoConfig | null | undefined,
  platform: string,
  redirectUri: string,
): CognitoClientConfig | null {
  if (!config || (platform !== 'android' && platform !== 'web')) return null;

  const clientId =
    platform === 'web'
      ? requiredString(config.webClientId)
      : requiredString(config.androidClientId);
  const region = requiredString(config.region);
  const userPoolId = requiredString(config.userPoolId);
  const domain = requiredString(config.domain);
  if (!clientId || !region || !userPoolId || !domain) return null;

  return {
    region,
    userPoolId,
    domain,
    clientId,
    redirectUri,
  };
}

export function createCognitoAuthClient(): CognitoAuthClient {
  const publicConfig = Constants.expoConfig?.extra
    ?.cognito as PublicCognitoConfig | undefined;
  const redirectUri = AuthSession.makeRedirectUri({
    native: 'voicechecklist://auth/callback',
    scheme: 'voicechecklist',
    path: 'auth/callback',
  });
  const config = resolveCognitoClientConfig(
    publicConfig,
    Platform.OS,
    redirectUri,
  );
  return config
    ? new CognitoAuthSessionClient(config)
    : new UnavailableCognitoAuthClient();
}

class UnavailableCognitoAuthClient implements CognitoAuthClient {
  signIn(): Promise<InteractiveSignInResult> {
    return Promise.reject(configurationError());
  }

  refresh(): Promise<OAuthTokens> {
    return Promise.reject(
      new CognitoSessionError(
        'temporarily-unavailable',
        'Google sign-in is not configured for this build.',
      ),
    );
  }

  revoke(): Promise<void> {
    return Promise.reject(configurationError());
  }

  deleteUser(): Promise<void> {
    return Promise.reject(configurationError());
  }
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function configurationError(): Error {
  return new Error('Google sign-in is not configured for this build.');
}
