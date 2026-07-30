# Voice Checklist

Voice Checklist is an Expo/React Native app for creating and running
hands-free checklists on Android and web.

Checklist content is stored in on-device SQLite. Users can choose fully local
mode or optional Google identity through Amazon Cognito; Google sign-in does
not upload or synchronize checklist content.

## Development

```bash
npm install
npm test
npm run lint
npm run typecheck
```

Start Android with `npm run android`, or start the development web origin with:

```bash
npx expo start --web --port 8082
```

Google sign-in is optional in development. To enable it, copy `.env.example`
to `.env.local` and add the development Cognito public values. See
[Google authentication configuration](docs/authentication.md) for callbacks,
client behavior, release variables, and security boundaries.

## Privacy and publishing

- [Privacy policy](docs/PRIVACY.md)
- [Account deletion instructions](docs/delete-account.md)
- [Google Play listing and Data Safety guidance](docs/store-listing.md)
- [Android publishing guide](docs/publishing-android.md)
