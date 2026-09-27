/**
 * @format
 */

import { AppRegistry } from 'react-native';
import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);

// 앱이 꺼져 있거나 뒤에 있을 때 온 알림: 알림창 표시는 안드로이드가 하므로 따로 할 일 없음
try {
  setBackgroundMessageHandler(getMessaging(), async () => {});
} catch {
  // 알림 설정 파일이 없으면 건너뛴다
}
