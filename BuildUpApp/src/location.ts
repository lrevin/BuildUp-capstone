// 휴대폰 현재 위치(GPS). 보고를 제출한 위치 기록, 현장 위치 저장에 쓴다.
// 위치 권한을 안 주거나 잡히지 않으면 null(보고는 그대로 제출된다).
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

export interface Place {
  latitude: number;
  longitude: number;
  accuracy: number | null; // 오차(m)
}

async function allowLocation() {
  if (Platform.OS !== 'android') {
    return true;
  }
  const res = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

function position(highAccuracy: boolean, timeout: number) {
  return new Promise<Place>((resolve, reject) =>
    Geolocation.getCurrentPosition(
      p =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: Number.isFinite(p.coords.accuracy)
            ? Math.round(p.coords.accuracy)
            : null,
        }),
      reject,
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 60_000 },
    ),
  );
}

/** 지금 위치. GPS가 느리면 기지국·와이파이 위치로 한 번 더 시도 */
export async function currentPlace(): Promise<Place | null> {
  try {
    if (!(await allowLocation())) {
      return null;
    }
    try {
      return await position(true, 6000);
    } catch {
      return await position(false, 4000);
    }
  } catch {
    return null;
  }
}

/** 두 지점 사이 거리(m) — 서버 PhotoMeta.distance와 같은 식 */
export function distanceMeters(
  a: Place,
  b: { latitude: number; longitude: number },
) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
