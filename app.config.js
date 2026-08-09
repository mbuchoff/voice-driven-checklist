module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
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
});
