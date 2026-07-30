# Google authentication configuration

Voice Checklist uses Amazon Cognito federated to Google. Identity resources are
managed outside this application repository.

## Required Cognito behavior

Each environment needs a Cognito user pool, managed-login domain, Google
identity provider, and public app clients with no client secrets:

- Development Android client for debug builds.
- Development web client for `http://localhost:8082`.
- Production Android client for Play builds.
- No production web client until production web hosting is selected.

Clients use authorization code with S256 PKCE and only the Google provider.
Allowed scopes are `openid`, `email`, `profile`, and
`aws.cognito.signin.user.admin`. Access and ID tokens last 60 minutes. Rotating
refresh tokens last 30 days with a 10-second retry grace period, and token
revocation is enabled.

Register these callback URLs exactly:

- Android: `voicechecklist://auth/callback`
- Development web: `http://localhost:8082/auth/callback`

The Google OAuth web client for an environment redirects only to that
environment's Cognito URL:

```text
https://<cognito-domain>/oauth2/idpresponse
```

The Google client secret belongs only in the identity-infrastructure secret
store. It must never enter this repository, an Expo build variable, or the app.

## Local development

Copy `.env.example` to `.env.local` and fill in development public values:

```text
EXPO_PUBLIC_COGNITO_REGION
EXPO_PUBLIC_COGNITO_USER_POOL_ID
EXPO_PUBLIC_COGNITO_DOMAIN
EXPO_PUBLIC_COGNITO_ANDROID_CLIENT_ID
EXPO_PUBLIC_COGNITO_WEB_CLIENT_ID
```

Run Expo web on the registered origin:

```bash
npx expo start --web --port 8082
```

These values are public endpoints/IDs, not credentials. A build with missing
values still supports local mode and reports Google sign-in as unavailable.

## Android releases

The Android release workflow reads production values from GitHub repository
variables named:

```text
COGNITO_REGION
COGNITO_USER_POOL_ID
COGNITO_DOMAIN
COGNITO_ANDROID_CLIENT_ID
```

The workflow must fail before building if any production value is missing.
Production Cognito deployment and changes remain manually approved outside this
repository.

## Credential and data boundaries

- Android persists only the refresh token in Expo SecureStore backed by Android
  Keystore and excluded from backup.
- Web persists only the refresh token in origin-scoped `localStorage`. This
  accepted static-SPA tradeoff depends on a strict content-security policy and
  preventing script injection.
- Access and ID tokens are memory-only.
- SQLite stores account mode and cached Cognito subject, display name, and
  email. It stores no token or authorization code.
- This release sends no checklist title, item, order, or database identifier to
  Google, Cognito, or any application API.

## Boundary for issue #21

Cloud synchronization is deferred to issue #21. Cognito `sub` will be the
canonical account identifier. A future checklist API must validate Cognito
JWTs, scope every cloud record to `sub`, and define an explicit migration or
linking path for any users of older custom authentication. It must not infer
identity from email, and it must preserve local-mode isolation.
