const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // lucide-react-native(아이콘)가 .mjs 파일로 배포되어 추가
    sourceExts: [...defaultConfig.resolver.sourceExts, 'mjs'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
