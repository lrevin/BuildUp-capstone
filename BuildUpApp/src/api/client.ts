import axios from 'axios';
import { ApiError } from '../data/dummy';

// 에뮬레이터에서 PC의 localhost는 10.0.2.2로 접근한다.
// 실제 폰은 같은 와이파이에서 PC의 IP(예: http://192.168.0.10:8080/api)를 넣는다.
export const DEFAULT_BASE_URL = 'http://10.0.2.2:8080/api';

// 연결 설정(앱의 '서버 설정' 화면에서 바꾸고 폰에 저장된다)
//   useDummy: true면 서버 없이 폰 안의 더미 데이터(src/data/dummy.ts)로 동작
export const config = {
  useDummy: false,
  baseUrl: DEFAULT_BASE_URL,
};

export const api = axios.create({
  baseURL: config.baseUrl,
  timeout: 15000,
});

export function applyConfig(next: Partial<typeof config>) {
  Object.assign(config, next);
  api.defaults.baseURL = config.baseUrl;
}

// 로그인한 사용자(더미 모드에서는 id, 서버 모드에서는 토큰으로 식별)
export const session = {
  userId: null as string | null,
  token: null as string | null,
};

api.interceptors.request.use(req => {
  if (session.token) {
    req.headers.Authorization = `Bearer ${session.token}`;
  }
  return req;
});

// 로그인 상태에서 서버가 '로그인이 필요합니다'(401)를 주면 부른다(auth.tsx가 로그아웃 처리)
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

api.interceptors.response.use(undefined, error => {
  const url: string = error?.config?.url ?? '';
  if (
    error?.response?.status === 401 &&
    session.token &&
    !url.includes('/auth/login') &&
    !url.includes('/auth/logout')
  ) {
    onUnauthorized?.();
  }
  return Promise.reject(error);
});

export function requireUserId() {
  if (!session.userId) {
    throw new ApiError('로그인이 필요합니다.');
  }
  return session.userId;
}

// 더미 모드에서 실제 네트워크처럼 약간 기다리게 한다.
export const fakeDelay = (ms = 500) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

// 화면에 띄울 에러 문구
export function errorMessage(e: unknown) {
  if (e instanceof ApiError) {
    return e.message;
  }
  if (axios.isAxiosError(e)) {
    const msg = (e.response?.data as { message?: string } | undefined)?.message;
    if (msg) {
      return msg;
    }
    return e.response
      ? `서버 오류가 발생했어요. (${e.response.status})`
      : '서버와 연결하지 못했어요. 서버가 켜져 있는지, 서버 주소가 맞는지 확인해 주세요.';
  }
  return '알 수 없는 오류가 발생했어요.';
}

// 서버 연결 확인(서버 설정 화면)
export async function checkServer(baseUrl: string) {
  const res = await axios.get<{ status: string }>(`${baseUrl}/health`, {
    timeout: 5000,
  });
  return res.data.status === 'ok';
}
