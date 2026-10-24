module.exports = {
  preset: '@react-native/jest-preset',
  // ESM으로 배포되는 라이브러리는 jest가 변환하도록 예외로 둔다
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|@react-native-firebase|react-native-.*)/)',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
  // 아이콘(lucide)은 .mjs라 jest가 못 읽으니 CommonJS 빌드를 쓴다
  moduleNameMapper: {
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
};
