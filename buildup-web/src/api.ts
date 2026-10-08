// 서버 API 호출 모음
import axios, { AxiosError } from 'axios';
import type {
  AuthResponse,
  HqInfo,
  MaterialRequest,
  Report,
  ReportPage,
  Site,
  SiteSummary,
  User,
} from './types';

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) || 'http://127.0.0.1:8080/api';

const TOKEN_KEY = 'buildup.web.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 저장소를 못 쓰면 이번 창에서만 유지 */
  }
}

export const api = axios.create({ baseURL: API_BASE, timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401이면 로그인 화면으로 돌려보낸다(AuthProvider가 등록)
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    const url = err.config?.url ?? '';
    if (err.response?.status === 401 && !url.includes('/auth/login')) {
      setToken(null);
      onUnauthorized?.();
    }
    return Promise.reject(err);
  },
);

// 서버 오류 메시지를 사용자에게 보여줄 문장으로
export function errorMessage(err: unknown, fallback = '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.') {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string; error?: string } | undefined;
    if (data && typeof data === 'object' && typeof data.message === 'string' && data.message) {
      return data.message;
    }
    if (!err.response) return '서버에 연결할 수 없어요. 서버가 켜져 있는지 확인해 주세요.';
  }
  return fallback;
}

// ---- 인증 ----
export async function login(email: string, password: string) {
  return (await api.post<AuthResponse>('/auth/login', { email, password })).data;
}
export async function logout() {
  await api.post('/auth/logout');
}
export async function me() {
  return (await api.get<User>('/auth/me')).data;
}

// ---- 본사 ----
export async function getHq() {
  return (await api.get<HqInfo>('/hq')).data;
}
export async function getHqSites() {
  return (await api.get<SiteSummary[]>('/hq/sites')).data;
}
export async function getHqReportPage(cursor?: string | null, size = 30) {
  return (
    await api.get<ReportPage>('/hq/reports/page', {
      params: { cursor: cursor || undefined, size },
    })
  ).data;
}
export async function getHqMaterials() {
  return (await api.get<MaterialRequest[]>('/hq/materials')).data;
}

// ---- 현장 ----
export async function getSites() {
  return (await api.get<SiteSummary[]>('/sites')).data;
}
export async function getSite(id: string) {
  return (await api.get<Site>(`/sites/${id}`)).data;
}
export async function getSiteReports(id: string) {
  return (await api.get<Report[]>(`/sites/${id}/reports`)).data;
}
export async function getSiteReportPage(
  id: string,
  opts: { cursor?: string | null; size?: number } = {},
) {
  return (
    await api.get<ReportPage>(`/sites/${id}/reports/page`, {
      params: {
        cursor: opts.cursor || undefined,
        size: opts.size ?? 30,
      },
    })
  ).data;
}
export async function getSiteMaterials(id: string) {
  return (await api.get<MaterialRequest[]>(`/sites/${id}/materials`)).data;
}

// ---- 검토·승인 ----
export async function reviewReport(
  reportId: string,
  status: 'approved' | 'revision',
  comment: string | null,
) {
  return (await api.patch<Report>(`/reports/${reportId}/review`, { status, comment })).data;
}
export async function setMaterialStatus(
  id: string,
  status: 'approved' | 'rejected',
  reason?: string,
) {
  return (await api.patch<MaterialRequest>(`/materials/${id}/status`, { status, reason })).data;
}

// ---- 작업일보 엑셀 ----
// Content-Disposition 의 filename* (UTF-8) → filename → 기본 이름 순으로 파일 이름을 정한다
function filenameFrom(header: string | undefined, fallback: string) {
  if (!header) return fallback;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* 아래로 */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : fallback;
}

export async function downloadWorklog(siteId: string, siteName: string, from: string, to: string) {
  const res = await api.get<Blob>(`/sites/${siteId}/worklog.xlsx`, {
    params: { from, to },
    responseType: 'blob',
  });
  const fallback = `${siteName.replace(/\s+/g, '_')}_작업일보_${from}_${to}.xlsx`;
  const name = filenameFrom(res.headers['content-disposition'] as string | undefined, fallback);
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
