/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/e2e/',
    '/playwright-report/',
    '/.expo/',
    '/dist/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(-[\\w-]+)?|@expo(nent)?(/.*)?|@expo-google-fonts/.*|react-navigation|@react-navigation(/.*)?|@unimodules(/.*)?|unimodules|sentry-expo|native-base|react-native-svg|nativewind|uuid)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
