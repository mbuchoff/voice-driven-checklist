// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite ships a wa-sqlite WASM module that Metro must treat as an asset.
config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];

// Ensure .mjs from packages like uuid resolves correctly.
config.resolver.sourceExts = Array.from(new Set([...config.resolver.sourceExts, 'mjs', 'cjs']));

module.exports = config;
