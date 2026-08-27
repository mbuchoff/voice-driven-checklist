# Google authentication configuration

Voice Checklist uses Amazon Cognito federated to Google. Identity resources are
exclusively owned by the public
[`voice-driven-checklist-backend`](https://github.com/mbuchoff/voice-driven-checklist-backend)
repository. Its authentication root documents separate environment state,
policy validation, planning, approval, and public app configuration. This app
repository contains no infrastructure apply path.

## App authentication behavior

The app requests authorization code flow with S256 PKCE and the `openid`,
`email`, `profile`, and `aws.cognito.signin.user.admin` scopes through the
Google identity provider.

The backend authentication root registers exactly these callbacks, and the app
derives matching redirect URIs:

- Android: `voicechecklist://auth/callback`
- Development web: `http://localhost:8082/auth/callback`

The Google client secret belongs only in the backend repository's
environment-scoped AWS Secrets Manager resource. It must never enter this
repository, GitHub secrets, an Expo build variable, or the app.

## Local development

Copy `.env.example` to `.env.local` and fill in development public values:

```text
EXPO_PUBLIC_COGNITO_REGION
EXPO_PUBLIC_COGNITO_USER_POOL_ID
EXPO_PUBLIC_COGNITO_DOMAIN
EXPO_PUBLIC_COGNITO_ANDROID_CLIENT_ID
EXPO_PUBLIC_COGNITO_WEB_CLIENT_ID
```

Retrieve those values from the backend authentication root as documented in
its [public app configuration instructions](https://github.com/mbuchoff/voice-driven-checklist-backend/tree/main/infra/aws/auth#read-public-app-configuration).

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

Obtain the production values from the same backend authentication root after
initializing it with `environment=production`, then set the repository
variables above.

The workflow must fail before building if any production value is missing.
Production Cognito deployment and changes remain protected and manually
approved in the backend repository.

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

## Boundary for issue #29

Cloud synchronization is deferred to backend issue #29. This app release
uploads no checklist content and preserves local-mode isolation. Backend API
authorization, record ownership, and account-migration requirements belong to
that backend issue and repository.
