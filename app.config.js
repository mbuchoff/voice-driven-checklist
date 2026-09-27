module.exports = ({ config }) => {
  const e2e = process.env.VOICE_CHECKLIST_E2E === '1';
  return {
    ...config,
    name: e2e ? `${config.name} E2E` : config.name,
    scheme: e2e ? `${config.scheme}-e2e` : config.scheme,
    android: {
      ...config.android,
      package: e2e
        ? `${config.android?.package}.e2e`
        : config.android?.package,
      versionCode: process.env.ANDROID_VERSION_CODE
        ? Number(process.env.ANDROID_VERSION_CODE)
        : config.android?.versionCode ?? 1,
    },
    extra: {
      ...config.extra,
      cognito: {
        region: process.env.EXPO_PUBLIC_COGNITO_REGION ?? null,
        userPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID ?? null,
        domain: process.env.EXPO_PUBLIC_COGNITO_DOMAIN ?? null,
        androidClientId:
          process.env.EXPO_PUBLIC_COGNITO_ANDROID_CLIENT_ID ?? null,
        webClientId: process.env.EXPO_PUBLIC_COGNITO_WEB_CLIENT_ID ?? null,
      },
    },
  };
};
