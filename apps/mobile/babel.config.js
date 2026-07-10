/**
 * Babel config for Expo SDK 52 (doc 11 §7). `babel-preset-expo` already wires
 * the expo-router plugin and React Native runtime; no extra plugins needed for
 * the skeleton.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
