const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'scripts/*'] },
  // React Native <Text> renders quotes literally; this rule is for web HTML
  { rules: { 'react/no-unescaped-entities': 'off' } },
]);
