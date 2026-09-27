// 휴대폰 알림(Firebase): 로그인하면 이 휴대폰을 서버에 등록하고, 로그아웃하면 지운다.
// 데모 모드(서버 없이)에서는 알림을 쓰지 않는다.
import { PermissionsAndroid, Platform } from 'react-native';
import {
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
} from '@react-native-firebase/messaging';
import { api, config, session } from './api/client';

/** 알림에 담겨 오는 값(서버 Notices.java) */
export interface PushData {
  type?: string; // report | material
  siteId?: string;
  siteName?: string;
}

let registered: string | null = null; // 서버에 등록한 이 휴대폰의 알림 주소
let stopRefresh: (() => void) | null = null;

async function allowNotifications() {
  // 안드로이드 13 이상은 알림을 띄우기 전에 허락을 받아야 한다
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const res = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return res === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
}

/** 로그인(또는 자동 로그인) 후 호출. 실패해도 앱 사용에는 지장 없다 */
export async function registerPush() {
  if (config.useDummy || !session.token) {
    return;
  }
  try {
    if (!(await allowNotifications())) {
      return;
    }
    const messaging = getMessaging();
    const token = await getToken(messaging);
    await api.post('/push/token', { token });
    registered = token;
    stopRefresh?.();
    // Firebase가 주소를 바꾸면 다시 등록
    stopRefresh = onTokenRefresh(messaging, async next => {
      if (session.token && !config.useDummy) {
        await api.post('/push/token', { token: next }).catch(() => {});
        registered = next;
      }
    });
  } catch {
    // 알림 설정 파일이 없거나 네트워크 문제: 알림 없이 계속
  }
}

/** 로그아웃 직전 호출: 이 휴대폰으로 더 이상 알림이 오지 않게 서버에서 지운다 */
export async function unregisterPush(authToken: string | null) {
  stopRefresh?.();
  stopRefresh = null;
  const token = registered;
  registered = null;
  if (!token || !authToken || config.useDummy) {
    return;
  }
  await api
    .delete('/push/token', {
      data: { token },
      headers: { Authorization: `Bearer ${authToken}` },
    })
    .catch(() => {});
}

/**
 * 알림 받기
 * - 앱을 보고 있을 때 온 알림: onForeground로 화면 안에 잠깐 보여 준다
 * - 알림을 눌러 앱이 열렸을 때: onOpen으로 해당 화면으로 이동
 */
export function listenPush(
  onForeground: (title: string, body: string) => void,
  onOpen: (data: PushData) => void,
) {
  if (config.useDummy) {
    return () => {};
  }
  try {
    const messaging = getMessaging();
    const offMessage = onMessage(messaging, m =>
      onForeground(m.notification?.title ?? '', m.notification?.body ?? ''),
    );
    const offOpen = onNotificationOpenedApp(messaging, m =>
      onOpen((m.data ?? {}) as PushData),
    );
    // 앱이 꺼져 있을 때 알림을 눌러 켠 경우
    getInitialNotification(messaging)
      .then(m => m && onOpen((m.data ?? {}) as PushData))
      .catch(() => {});
    return () => {
      offMessage();
      offOpen();
    };
  } catch {
    return () => {};
  }
}
