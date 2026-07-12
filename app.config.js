module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    versionCode: process.env.ANDROID_VERSION_CODE
      ? Number(process.env.ANDROID_VERSION_CODE)
      : config.android?.versionCode ?? 1,
  },
});
