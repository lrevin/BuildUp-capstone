/* eslint-env jest */
// 자동 테스트(jest)에는 휴대폰 기능(저장소·알림·위치·사진 등)이 없어서 가짜로 바꿔 둔다

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// 폰 저장소: 메모리에만 저장
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  const api = {
    getItem: jest.fn(async k => (store.has(k) ? store.get(k) : null)),
    setItem: jest.fn(async (k, v) => {
      store.set(k, v);
    }),
    removeItem: jest.fn(async k => {
      store.delete(k);
    }),
    multiRemove: jest.fn(async keys => keys.forEach(k => store.delete(k))),
    clear: jest.fn(async () => store.clear()),
    getAllKeys: jest.fn(async () => [...store.keys()]),
  };
  return {
    __esModule: true,
    default: api,
    ...api,
    createAsyncStorage: () => api,
  };
});

// 휴대폰 알림(Firebase): 아무것도 하지 않음
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(async () => 'test-token'),
  onTokenRefresh: jest.fn(() => () => {}),
  onMessage: jest.fn(() => () => {}),
  onNotificationOpenedApp: jest.fn(() => () => {}),
  getInitialNotification: jest.fn(async () => null),
  setBackgroundMessageHandler: jest.fn(),
}));

jest.mock('@react-native-community/geolocation', () => ({
  getCurrentPosition: jest.fn(),
  requestAuthorization: jest.fn(),
  setRNConfiguration: jest.fn(),
}));

jest.mock('@react-native-community/datetimepicker', () => () => null);

jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(async () => []),
  types: {},
  errorCodes: {},
  isErrorWithCode: () => false,
}));

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(async () => ({ didCancel: true })),
  launchImageLibrary: jest.fn(async () => ({ didCancel: true })),
}));
