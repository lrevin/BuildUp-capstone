import axios from 'axios';
import { ApiError } from '../data/dummy';
import { DEMO_BUILD } from '../demoBuild';

// 에뮬레이터에서 PC의 localhost는 10.0.2.2로 접근한다.
// 실제 폰은 같은 와이파이에서 PC의 IP(예: http://192.168.0.10:8080/api)를 넣는다.
export const DEFAULT_BASE_URL = 'http://10.0.2.2:8080/api';

// 예전에 쓰던 배포 서버 주소: 폰에 이 주소가 저장돼 있으면 지금 주소(DEFAULT_BASE_URL)로 바꾼다
export const OLD_SERVER_URLS = ['http://3.39.51.236/api'];

// 연결 설정(앱의 '서버 설정' 화면에서 바꾸고 폰에 저장된다)
//   useDummy: true면 서버 없이 폰 안의 더미 데이터(src/data/dummy.ts)로 동작
export const config = {
  useDummy: DEMO_BUILD, // 시연용 설치 파일은 처음부터 데모 모드
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
  token: null as string | null, // 접근 토큰
  refreshToken: null as string | null,
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

// 접근 토큰을 새로 받으면 폰에 저장(buildup.ts가 연결)
let onTokenRefreshed: ((accessToken: string) => void) | null = null;
export function setTokenRefreshedHandler(fn: ((t: string) => void) | null) {
  onTokenRefreshed = fn;
}

// 여러 요청이 동시에 401을 받아도 갱신은 한 번만
let refreshing: Promise<string | null> | null = null;
function refreshAccessToken(): Promise<string | null> {
  if (!session.refreshToken) {
    return Promise.resolve(null);
  }
  if (!refreshing) {
    refreshing = axios
      .post<{ accessToken: string }>(
        `${config.baseUrl}/auth/refresh`,
        { refreshToken: session.refreshToken },
        { timeout: 15000 },
      )
      .then(res => {
        session.token = res.data.accessToken;
        onTokenRefreshed?.(res.data.accessToken);
        return session.token;
      })
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

const NO_REFRESH = [
  '/auth/login',
  '/auth/signup',
  '/auth/refresh',
  '/auth/logout',
];

// 401: 접근 토큰이 만료됐으면 리프레시 토큰으로 새로 받아 한 번만 다시 보낸다.
// 리프레시 토큰도 안 되면 로그아웃(auth.tsx)
api.interceptors.response.use(undefined, async error => {
  const req = error?.config;
  const url: string = req?.url ?? '';
  if (
    error?.response?.status === 401 &&
    session.token &&
    !NO_REFRESH.some(u => url.includes(u))
  ) {
    if (req && !req._retried) {
      const next = await refreshAccessToken();
      if (next) {
        req._retried = true;
        req.headers.Authorization = `Bearer ${next}`;
        return api.request(req);
      }
    }
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
