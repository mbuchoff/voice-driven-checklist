import type { GoogleIdentity } from './types';

export type OAuthTokens = {
  accessToken: string;
  idToken: string | null;
  refreshToken: string | null;
};

export type InteractiveSignInResult =
  | { type: 'cancelled' }
  | {
      type: 'success';
      identity: GoogleIdentity;
      tokens: OAuthTokens;
    };

export interface CognitoAuthClient {
  signIn(): Promise<InteractiveSignInResult>;
  refresh(refreshToken: string): Promise<OAuthTokens>;
  revoke(refreshToken: string): Promise<void>;
  deleteUser(accessToken: string): Promise<void>;
}

export type CognitoSessionErrorKind =
  | 'temporarily-unavailable'
  | 'reauth-required';

export class CognitoSessionError extends Error {
  constructor(
    readonly kind: CognitoSessionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'CognitoSessionError';
  }
}
