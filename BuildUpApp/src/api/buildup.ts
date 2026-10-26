// 화면은 이 파일의 함수만 호출한다. 더미/서버 전환은 client.ts의 config.useDummy(서버 설정 화면)로.
import { ApiError, dummyDb } from '../data/dummy';
import axios from 'axios';
import { unregisterPush } from '../push';
import {
  ServerConfig,
  dummyStore,
  kakaoStore,
  serverConfigStore,
  sessionStore,
} from '../data/storage';
import {
  AuthResponse,
  CodeSent,
  CreateSiteInput,
  HqInfo,
  KakaoSignup,
  ManagerInput,
  MaterialRequest,
  MaterialStatus,
  Member,
  NewMaterialRequest,
  NewReport,
  ProcessInput,
  ProgressMode,
  Report,
  ReportPage,
  SeenInput,
  SignUpInput,
  Site,
  SitePreview,
  SiteSummary,
  UpdateSiteInput,
  User,
} from '../types';
import {
  api,
  applyConfig,
  config,
  DEFAULT_BASE_URL,
  fakeDelay,
  OLD_SERVER_URLS,
  requireUserId,
  session,
  setTokenRefreshedHandler,
} from './client';

// 더미 모드: 데이터를 바꾸는 호출 뒤에 폰에 저장
async function dummyWrite<T>(fn: () => T, ms = 500): Promise<T> {
  await fakeDelay(ms);
  const result = fn();
  await dummyStore.save();
  return result;
}

async function dummyRead<T>(fn: () => T, ms = 300): Promise<T> {
  await fakeDelay(ms);
  return fn();
}

function startSession(user: User, auth: AuthResponse | null) {
  session.userId = user.id;
  session.token = auth?.accessToken ?? null;
  session.refreshToken = auth?.refreshToken ?? null;
  sessionStore.save({
    userId: user.id,
    token: session.token,
    refreshToken: session.refreshToken,
    user,
  });
  return user;
}

// 접근 토큰을 새로 받으면 저장해 둔다(앱을 다시 켜도 이어서 쓰게)
setTokenRefreshedHandler(accessToken => {
  sessionStore
    .load()
    .then(saved => saved && sessionStore.save({ ...saved, token: accessToken }))
    .catch(() => {});
});

// ---- 서버 연결 설정 ----

export async function saveServerConfig(next: ServerConfig) {
  const changed =
    next.useDummy !== config.useDummy || next.baseUrl !== config.baseUrl;
  if (changed) {
    logout(); // 다른 서버(또는 더미)의 로그인 정보는 쓸 수 없다
  }
  applyConfig(next);
  await serverConfigStore.save(next);
  if (next.useDummy) {
    await dummyStore.load();
  }
}

// ---- 계정 ----

// 앱 시작 시: 저장된 데이터와 로그인 상태 복원
export async function restoreSession(): Promise<User | null> {
  const server = await serverConfigStore.load();
  if (server) {
    // 예전 배포 주소(IP, http)로 저장된 설정은 지금 주소로 바꾼다(서버가 https 도메인으로 옮겨 IP로는 404)
    if (OLD_SERVER_URLS.includes(server.baseUrl)) {
      server.baseUrl = DEFAULT_BASE_URL;
      await serverConfigStore.save(server);
    }
    applyConfig(server);
  }
  if (config.useDummy) {
    await dummyStore.load();
  }
  const saved = await sessionStore.load();
  if (!saved) {
    return null;
  }
  session.userId = saved.userId;
  session.token = saved.token;
  session.refreshToken = saved.refreshToken ?? null;
  try {
    if (config.useDummy) {
      const user = dummyDb.getUser(saved.userId);
      if (!user) {
        throw new Error('no user');
      }
      return user;
    }
    const me = (await api.get<User>('/auth/me')).data;
    sessionStore.save({ ...saved, user: me });
    return me;
  } catch (e) {
    // 서버가 꺼져 있거나 인터넷이 안 될 때는 로그인을 유지하고 저장된 정보로 시작
    if (axios.isAxiosError(e) && !e.response && saved.user) {
      return saved.user;
    }
    logout();
    return null;
  }
}

export async function login(email: string, password: string): Promise<User> {
  if (config.useDummy) {
    await fakeDelay();
    return startSession(dummyDb.login(email, password), null);
  }
  const res = await api.post<AuthResponse>('/auth/login', {
    email,
    password,
  });
  return startSession(res.data.user, res.data);
}

export async function signUp(input: SignUpInput): Promise<User> {
  if (config.useDummy) {
    return startSession(await dummyWrite(() => dummyDb.signUp(input)), null);
  }
  const res = await api.post<AuthResponse>('/auth/signup', input);
  return startSession(res.data.user, res.data);
}

// ---- 가입 인증(이메일·휴대폰, 둘 다 필수) ----
// 데모 모드는 코드를 보내지 않고, 6자리 숫자면 무엇이든 통과(시연용)

const DEMO_SENT: CodeSent = { expiresInSeconds: 300, resendAfterSeconds: 60 };

function demoCode(code: string, kind: string) {
  if (!/^\d{6}$/.test(code.trim())) {
    throw new ApiError('인증 코드 6자리를 입력해 주세요.');
  }
  return `demo-${kind}`;
}

export async function sendEmailCode(email: string): Promise<CodeSent> {
  if (config.useDummy) {
    await fakeDelay();
    return DEMO_SENT;
  }
  const res = await api.post<CodeSent>('/auth/email/send', {
    email: email.trim(),
  });
  return res.data;
}

/** 맞으면 가입에 같이 보낼 이메일 인증 토큰 */
export async function verifyEmailCode(email: string, code: string) {
  if (config.useDummy) {
    await fakeDelay();
    return demoCode(code, 'email');
  }
  const res = await api.post<{ emailVerificationToken: string }>(
    '/auth/email/verify',
    { email: email.trim(), code: code.trim() },
  );
  return res.data.emailVerificationToken;
}

export async function sendPhoneCode(phone: string): Promise<CodeSent> {
  if (config.useDummy) {
    await fakeDelay();
    return DEMO_SENT;
  }
  const res = await api.post<CodeSent>('/auth/phone/send', { phone });
  return res.data;
}

/** 맞으면 가입에 같이 보낼 휴대폰 인증 토큰 */
export async function verifyPhoneCode(phone: string, code: string) {
  if (config.useDummy) {
    await fakeDelay();
    return demoCode(code, 'phone');
  }
  const res = await api.post<{ phoneVerificationToken: string }>(
    '/auth/phone/verify',
    { phone, code: code.trim() },
  );
  return res.data.phoneVerificationToken;
}

// ---- 비밀번호 재설정(메일 코드 확인 → 새 비밀번호) ----

export async function sendPasswordCode(email: string): Promise<CodeSent> {
  if (config.useDummy) {
    await fakeDelay();
    return DEMO_SENT;
  }
  const res = await api.post<CodeSent>('/auth/password/send', {
    email: email.trim(),
  });
  return res.data;
}

/** 맞으면 새 비밀번호를 정할 때 보낼 토큰 */
export async function verifyPasswordCode(email: string, code: string) {
  if (config.useDummy) {
    await fakeDelay();
    return demoCode(code, 'email');
  }
  const res = await api.post<{ resetToken: string }>('/auth/password/verify', {
    email: email.trim(),
    code: code.trim(),
  });
  return res.data.resetToken;
}

/** 새 비밀번호로 바꾼다(다른 기기 로그인은 끊긴다) */
export async function resetPassword(
  email: string,
  resetToken: string,
  password: string,
) {
  if (config.useDummy) {
    await fakeDelay();
    return;
  }
  await api.post('/auth/password/reset', {
    email: email.trim(),
    resetToken,
    password,
  });
}

/** 회원 탈퇴: 바로 로그아웃되고 7일 뒤 계정 정보가 영구 삭제된다 → 삭제 예정 시각 */
export async function withdraw(): Promise<string> {
  if (config.useDummy) {
    throw new ApiError('데모 모드에서는 탈퇴할 수 없어요.');
  }
  const res = await api.delete<{ ok: boolean; deleteAt: string }>('/auth/me');
  return res.data.deleteAt;
}

// ---- 카카오 로그인(휴대폰 브라우저 → 서버 → 앱 buildupapp://oauth/kakao?ticket=) ----

/**
 * 카카오 로그인 시작: 서버가 준 key를 폰에 저장하고, 브라우저로 열 주소를 돌려준다.
 * 결과는 이 key가 있어야 받을 수 있다(다른 사람이 보낸 로그인 링크로는 로그인되지 않게)
 */
export async function kakaoBegin() {
  const res = await api.post<{ url: string; key: string }>(
    '/auth/oauth/kakao/begin',
  );
  await kakaoStore.save({ key: res.data.key, startedAt: Date.now() });
  return res.data.url;
}

export type KakaoResult = { user: User } | { signup: KakaoSignup };

/**
 * 앱으로 돌아온 티켓으로 결과 받기: 가입된 사람은 로그인, 처음이면 가입 정보.
 * 이 휴대폰에서 시작한 카카오 로그인이 없으면(10분 지남 포함) null → 링크를 무시한다
 */
export async function kakaoTicket(ticket: string): Promise<KakaoResult | null> {
  const pending = await kakaoStore.load();
  if (!pending || Date.now() - pending.startedAt > 10 * 60 * 1000) {
    await kakaoStore.clear();
    return null;
  }
  await kakaoStore.clear(); // 티켓은 한 번만 쓸 수 있으니 결과와 상관없이 지운다
  const res = await api.post<
    AuthResponse | (KakaoSignup & { signupRequired: true })
  >('/auth/oauth/kakao/ticket', { ticket, key: pending.key });
  const data = res.data;
  if ('signupRequired' in data && data.signupRequired) {
    return {
      signup: {
        signupToken: data.signupToken,
        email: data.email ?? null,
        name: data.name ?? null,
      },
    };
  }
  const auth = data as AuthResponse;
  return { user: startSession(auth.user, auth) };
}

export function logout() {
  if (!config.useDummy && session.token) {
    // 서버의 토큰도 지운다(실패해도 앱에서는 로그아웃)
    const token = session.token; // 아래에서 지우기 전에 기억
    const refreshToken = session.refreshToken;
    // 이 휴대폰 알림 등록을 먼저 지우고(로그인 토큰이 필요) 로그아웃(접근·리프레시 토큰 모두 무효)
    unregisterPush(token)
      .then(() =>
        api.post(
          '/auth/logout',
          { refreshToken },
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      )
      .catch(() => {});
  }
  session.userId = null;
  session.token = null;
  session.refreshToken = null;
  sessionStore.clear();
}

// 현장 관리자로 전환하거나 보고 체계(본사 보고 / 최고 책임자)를 바꾼다
export async function setManager(input: ManagerInput): Promise<User> {
  const user = config.useDummy
    ? await dummyWrite(() => dummyDb.setManager(requireUserId(), input))
    : (await api.put<User>('/auth/me/manager', input)).data;
  const saved = await sessionStore.load();
  if (saved) {
    sessionStore.save({ ...saved, user });
  }
  return user;
}

// 데모용: 더미 데이터를 처음 상태로
export async function resetDemoData() {
  await dummyStore.reset();
}

// ---- 현장 ----

export async function fetchMySites(): Promise<SiteSummary[]> {
  if (config.useDummy) {
    return dummyRead(() => dummyDb.getMySites(requireUserId()));
  }
  return (await api.get<SiteSummary[]>('/sites')).data;
}

export async function fetchSite(siteId: string): Promise<Site> {
  if (config.useDummy) {
    return dummyRead(() => dummyDb.getSite(requireUserId(), siteId));
  }
  return (await api.get<Site>(`/sites/${siteId}`)).data;
}

// 총관리자: 현장 만들기(6자리 코드 자동 발급)
export async function createSite(input: CreateSiteInput): Promise<Site> {
  if (config.useDummy) {
    return dummyWrite(() => dummyDb.createSite(requireUserId(), input));
  }
  return (await api.post<Site>('/sites', input)).data;
}

// 총관리자: 현장 정보 수정
export async function updateSite(
  siteId: string,
  input: UpdateSiteInput,
): Promise<Site> {
  if (config.useDummy) {
    return dummyWrite(() => dummyDb.updateSite(requireUserId(), siteId, input));
  }
  return (await api.patch<Site>(`/sites/${siteId}`, input)).data;
}

// 총관리자: 진행률 계산 방식(직접 입력 / 자동 계산)과 공정·가중치 저장
export async function setProgressMode(
  siteId: string,
  mode: ProgressMode,
  processes: ProcessInput[],
): Promise<Site> {
  if (config.useDummy) {
    return dummyWrite(() =>
      dummyDb.setProgressMode(requireUserId(), siteId, mode, processes),
    );
  }
  return (
    await api.put<Site>(`/sites/${siteId}/progress-mode`, { mode, processes })
  ).data;
}

// 총관리자: 현장 삭제(보고 이력도 함께 삭제)
export async function deleteSite(siteId: string) {
  if (config.useDummy) {
    return dummyWrite(() => dummyDb.deleteSite(requireUserId(), siteId));
  }
  await api.delete(`/sites/${siteId}`);
}

// 총관리자: 코드 재발급(이전 코드는 더 이상 사용 불가)
export async function regenerateCode(siteId: string): Promise<string> {
  if (config.useDummy) {
    return dummyWrite(() => dummyDb.regenerateCode(requireUserId(), siteId));
  }
  return (await api.post<{ code: string }>(`/sites/${siteId}/code`)).data.code;
}

// 작업자: 코드로 현장 미리보기 → 참여
export async function previewSiteByCode(code: string): Promise<SitePreview> {
  if (config.useDummy) {
    return dummyRead(() => dummyDb.previewByCode(requireUserId(), code), 500);
  }
  return (await api.get<SitePreview>(`/sites/code/${code}`)).data;
}

export async function joinSiteByCode(code: string): Promise<SiteSummary> {
  if (config.useDummy) {
    return dummyWrite(() => dummyDb.joinByCode(requireUserId(), code));
  }
  return (await api.post<SiteSummary>('/sites/join', { code })).data;
}

// ---- 참여자 ----

export async function fetchMembers(siteId: string): Promise<Member[]> {
  if (config.useDummy) {
    return dummyRead(() => dummyDb.getMembers(requireUserId(), siteId));
  }
  return (await api.get<Member[]>(`/sites/${siteId}/members`)).data;
}

// 총관리자: 참여자 내보내기
export async function removeMember(siteId: string, memberId: string) {
  if (config.useDummy) {
    return dummyWrite(() =>
      dummyDb.removeMember(requireUserId(), siteId, memberId),
    );
  }
  await api.delete(`/sites/${siteId}/members/${memberId}`);
}

// 작업자: 현장 나가기
export async function leaveSite(siteId: string) {
  if (config.useDummy) {
    return dummyWrite(() => dummyDb.leaveSite(requireUserId(), siteId));
  }
  await api.delete(`/sites/${siteId}/members/me`);
}

// ---- 보고 ----

export async function fetchReports(siteId: string): Promise<Report[]> {
  if (config.useDummy) {
    return dummyRead(() => dummyDb.getReports(requireUserId(), siteId));
  }
  return (await api.get<Report[]>(`/sites/${siteId}/reports`)).data;
}

/** 보고 이력 한 묶음(30건). cursor는 앞 묶음의 nextCursor, 첫 묶음은 null */
export async function fetchReportPage(
  siteId: string,
  opts: { cursor?: string | null; size?: number } = {},
): Promise<ReportPage> {
  if (config.useDummy) {
    return dummyRead(() =>
      dummyDb.getReportPage(requireUserId(), siteId, opts),
    );
  }
  const params: Record<string, string | number> = { size: opts.size ?? 30 };
  if (opts.cursor) {
    params.cursor = opts.cursor;
  }
  return (
    await api.get<ReportPage>(`/sites/${siteId}/reports/page`, { params })
  ).data;
}

/** 현장별 확인하지 않은 보고 수(홈 화면 빨간 숫자). 서버가 세어서 숫자만 준다 */
export async function fetchUnreadCounts(
  seen: SeenInput,
): Promise<Record<string, number>> {
  if (Object.keys(seen).length === 0) {
    return {};
  }
  if (config.useDummy) {
    return dummyRead(() => dummyDb.getUnread(requireUserId(), seen));
  }
  return (await api.post<Record<string, number>>('/reports/unread', { seen }))
    .data;
}

/** 작업일보 엑셀: 10분짜리 내려받기 주소를 받아 브라우저로 연다. from/to는 YYYY-MM-DD */
export async function worklogLink(
  siteId: string,
  from: string,
  to: string,
): Promise<string> {
  if (config.useDummy) {
    throw new ApiError(
      '엑셀 내려받기는 서버에 연결했을 때만 쓸 수 있어요. (서버 설정에서 연결)',
    );
  }
  const res = await api.post<{ url: string }>(
    `/sites/${siteId}/worklog/link`,
    null,
    { params: { from, to } },
  );
  return res.data.url;
}

export async function submitReport(input: NewReport): Promise<Report> {
  if (config.useDummy) {
    return dummyWrite(() => dummyDb.addReport(requireUserId(), input), 700);
  }
  // 서버 연동 시: 사진은 multipart/form-data로 함께 업로드
  const form = new FormData();
  form.append('work', input.work);
  if (input.processKey) {
    form.append('processKey', input.processKey);
    form.append('processTo', String(input.processTo ?? 0));
  } else {
    form.append('to', String(input.to));
  }
  form.append('memo', input.memo);
  form.append('workLog', JSON.stringify(input.workLog));
  input.photoUris.forEach((uri, i) =>
    form.append('photos', {
      uri,
      name: `photo_${i}.jpg`,
      type: 'image/jpeg',
    } as any),
  );
  // 첨부 문서(엑셀·PDF 등): 원래 파일 이름 그대로 보낸다
  // 사진별 촬영 시각(사진 파일에 촬영 정보가 없을 때 서버가 쓴다)
  input.photoUris.forEach((_, i) =>
    form.append('photoTakenAt', input.photoTakenAt?.[i] ?? ''),
  );
  // 제출 위치
  if (input.location) {
    form.append('latitude', String(input.location.latitude));
    form.append('longitude', String(input.location.longitude));
    if (input.location.accuracy != null) {
      form.append('accuracy', String(input.location.accuracy));
    }
  }
  input.files.forEach(f =>
    form.append('files', {
      uri: f.uri,
      name: f.name,
      type: f.type ?? 'application/octet-stream',
    } as any),
  );
  const res = await api.post<Report>(`/sites/${input.siteId}/reports`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

// 본사 관계자·현장 총관리자: 보고 승인 / 보완 요청(코멘트 필수)
export async function reviewReport(
  reportId: string,
  status: 'approved' | 'revision',
  comment?: string,
): Promise<Report> {
  if (config.useDummy) {
    return dummyWrite(() =>
      dummyDb.reviewReport(requireUserId(), reportId, status, comment ?? ''),
    );
  }
  return (
    await api.patch<Report>(`/reports/${reportId}/review`, { status, comment })
  ).data;
}

// 현장 총관리자: 현장 위치 저장(null이면 지우기)
export async function setSiteLocation(
  siteId: string,
  point: { latitude: number; longitude: number } | null,
): Promise<Site> {
  if (config.useDummy) {
    return dummyWrite(() =>
      dummyDb.setSiteLocation(requireUserId(), siteId, point),
    );
  }
  return (
    await api.put<Site>(`/sites/${siteId}/location`, {
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
    })
  ).data;
}

// 작성자: 메모 수정
export async function updateReportMemo(
  reportId: string,
  memo: string,
): Promise<Report> {
  if (config.useDummy) {
    return dummyWrite(() =>
      dummyDb.updateReportMemo(requireUserId(), reportId, memo),
    );
  }
  return (await api.patch<Report>(`/reports/${reportId}`, { memo })).data;
}

// 공정의 가장 최근 보고 삭제(진행률 되돌림)
export async function deleteReport(reportId: string) {
  if (config.useDummy) {
    return dummyWrite(() => dummyDb.deleteReport(requireUserId(), reportId));
  }
  await api.delete(`/reports/${reportId}`);
}

// ---- 자재 요청 ----

export async function fetchMaterials(
  siteId: string,
): Promise<MaterialRequest[]> {
  if (config.useDummy) {
    return dummyRead(() => dummyDb.getMaterials(requireUserId(), siteId));
  }
  return (await api.get<MaterialRequest[]>(`/sites/${siteId}/materials`)).data;
}

export async function requestMaterials(
  input: NewMaterialRequest,
): Promise<MaterialRequest> {
  if (config.useDummy) {
    return dummyWrite(() => dummyDb.addMaterial(requireUserId(), input));
  }
  const { siteId, ...body } = input;
  return (await api.post<MaterialRequest>(`/sites/${siteId}/materials`, body))
    .data;
}

// 총관리자·본사: 승인 / 반려(사유)
export async function setMaterialStatus(
  requestId: string,
  status: Exclude<MaterialStatus, 'requested'>,
  reason?: string,
): Promise<MaterialRequest> {
  if (config.useDummy) {
    return dummyWrite(() =>
      dummyDb.setMaterialStatus(requireUserId(), requestId, status, reason),
    );
  }
  return (
    await api.patch<MaterialRequest>(`/materials/${requestId}/status`, {
      status,
      reason,
    })
  ).data;
}

// 작성자: 처리 전 요청 취소
export async function cancelMaterial(requestId: string) {
  if (config.useDummy) {
    return dummyWrite(() => dummyDb.cancelMaterial(requireUserId(), requestId));
  }
  await api.delete(`/materials/${requestId}`);
}

// ---- 본사 ----

// 본사 관계자: 본사 정보(본사 코드, 연결 현장 수, 관계자)
export async function fetchHqInfo(): Promise<HqInfo> {
  if (config.useDummy) {
    return dummyRead(() => dummyDb.getHqInfo(requireUserId()));
  }
  return (await api.get<HqInfo>('/hq')).data;
}

// 본사 관계자: 연결된 현장 현황(pendingMaterials = 승인 대기)
export async function fetchHqSites(): Promise<SiteSummary[]> {
  if (config.useDummy) {
    return dummyRead(() => dummyDb.getHqSites(requireUserId()));
  }
  return (await api.get<SiteSummary[]>('/hq/sites')).data;
}

// 본사 관계자: 연결된 현장들의 보고 한 묶음(최신순)
export async function fetchHqReportPage(
  cursor: string | null = null,
  size = 30,
): Promise<ReportPage> {
  if (config.useDummy) {
    return dummyRead(() =>
      dummyDb.getHqReportPage(requireUserId(), cursor, size),
    );
  }
  const params: Record<string, string | number> = { size };
  if (cursor) {
    params.cursor = cursor;
  }
  return (await api.get<ReportPage>('/hq/reports/page', { params })).data;
}

// 본사 관계자: 연결된 현장들의 자재 요청
export async function fetchHqMaterials(): Promise<MaterialRequest[]> {
  if (config.useDummy) {
    return dummyRead(() => dummyDb.getHqMaterials(requireUserId()));
  }
  return (await api.get<MaterialRequest[]>('/hq/materials')).data;
}

// 총관리자: 본사 코드로 본사명 확인 → 현장 연결 / 해제
export async function previewCompany(code: string): Promise<string> {
  if (config.useDummy) {
    return dummyRead(() => dummyDb.previewCompany(code), 400);
  }
  return (await api.get<{ name: string }>(`/companies/code/${code}`)).data.name;
}

export async function linkCompany(siteId: string, code: string): Promise<Site> {
  if (config.useDummy) {
    return dummyWrite(() => dummyDb.linkCompany(requireUserId(), siteId, code));
  }
  return (await api.put<Site>(`/sites/${siteId}/hq`, { code })).data;
}

export async function unlinkCompany(siteId: string): Promise<Site> {
  if (config.useDummy) {
    return dummyWrite(() => dummyDb.unlinkCompany(requireUserId(), siteId));
  }
  return (await api.delete<Site>(`/sites/${siteId}/hq`)).data;
}
