// 앱 전체에서 쓰는 데이터 모양(나중에 서버 API 응답도 이 모양에 맞춘다)

// 계정 종류: 현장 관리자 / 일반 작업자 / 본사 관계자
// (현장 안에서의 권한은 현장마다 정해진다: 현장을 만든 사람 = 관리자, 코드로 참여 = 작업자.
//  그래서 현장 관리자도 다른 현장에서는 작업자일 수 있다)
// system: 시스템 관리자(웹 대시보드 전용, 가입으로는 만들 수 없음)
export type Role = 'admin' | 'worker' | 'hq' | 'system';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  company?: string; // 현장 관리자: 회사·사무소명 / 본사 관계자: 본사명
  companyCode?: string | null; // 본사 관계자만: 6자리 본사 코드
  hqName?: string | null; // 현장 관리자만: 보고하는 본사(null이면 최고 책임자)
  hqRole?: 'manager' | 'member' | null; // 본사 관계자만: 본사 관리자 / 본사 일반 직원
  canReviewReports?: boolean; // 본사에서 보고 검토·자재 승인 가능(본사 관리자)
}

// 로그인·가입·토큰 갱신 응답(서버 AuthDtos.AuthResponse)
export interface AuthResponse {
  user: User;
  accessToken: string; // API 호출에 쓰는 토큰(기본 60분)
  refreshToken: string; // 접근 토큰을 다시 받는 토큰(기본 30일)
  tokenType: 'Bearer';
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface SignUpInput {
  role: Role;
  name: string;
  email: string;
  phone: string;
  password?: string; // 카카오 가입(signupToken)이면 없음
  company?: string; // 본사 관계자(새 본사 등록): 본사명
  companyCode?: string; // 본사 관계자: 합류할 본사 코드 / 현장 관리자: 보고할 본사 코드(없으면 최고 책임자)
  emailVerificationToken?: string; // 이메일 인증 결과(카카오가 인증한 이메일이면 없어도 됨)
  phoneVerificationToken?: string; // 휴대폰 인증 결과(필수)
  signupToken?: string; // 카카오 첫 로그인 때 받은 가입 토큰
  // 필수 동의: 만 14세 이상 · 이용약관 · 개인정보 수집·이용(모두 true여야 가입)
  agreeAge: boolean;
  agreeTerms: boolean;
  agreePrivacy: boolean;
}

// 인증 코드를 보냄: 유효 시간, 다시 받을 수 있을 때까지(초)
export interface CodeSent {
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

// 카카오로 처음 온 사람: 가입 화면에서 이어서 가입
export interface KakaoSignup {
  signupToken: string;
  email: string | null; // 카카오가 인증한 이메일(없으면 직접 입력 + 이메일 인증)
  name: string | null;
}

// 현장 관리자 전환·보고 체계 변경
export interface ManagerInput {
  companyCode: string | null; // 비우면 최고 책임자
  company?: string; // 회사·사무소명
  linkSites: boolean; // 내가 만든 현장들의 본사 연결도 같이 바꾸기
}

export type Weather = 'sunny' | 'cloudy' | 'rain' | 'snow';

// 작업일보 항목(모두 선택 입력)
export interface WorkLog {
  weather: Weather | null;
  workers: number | null; // 투입 인원(명)
  equipment: string; // 투입 장비
}

// 진행률 계산 방식: 직접 입력(보고하는 사람이 판단) / 자동 계산(공정 가중치)
export type ProgressMode = 'manual' | 'auto';

// 공정(자동 계산 방식): weight = 가중치(%), progress = 공정별 진행률(%)
export interface SiteProcess {
  key: string;
  name: string;
  weight: number;
  progress: number;
  lastReportedAt: string | null;
}

// 공정 입력(key가 없으면 새 공정)
export interface ProcessInput {
  key?: string;
  name: string;
  weight: number;
}

export interface Site {
  id: string;
  name: string;
  address: string;
  ownerId: string;
  ownerName: string;
  code: string | null; // 6자리 참여 코드(총관리자에게만 보임)
  memberCount: number;
  overallProgress: number; // 현장 전체 진행률(%): 직접 입력 값 또는 공정 가중치로 계산한 값
  workType: string | null; // 공사 종류(예: 실내건축 공사, 상·하수도 설비 공사)
  lastReportedAt: string | null; // 마지막 보고(ISO 날짜)
  hqName: string | null; // 연결된 본사(없으면 null)
  latitude?: number | null; // 현장 위치(보고 위치 확인 기준)
  longitude?: number | null;
  progressMode?: ProgressMode; // 없으면 직접 입력
  processes?: SiteProcess[]; // 자동 계산 방식의 공정
  materials?: SiteMaterial[]; // 현장 자재 재고(남은 양). 승인된 보고에서 쓴 만큼 줄어든다
}

// 현장 자재 재고 한 줄
export interface SiteMaterial {
  name: string;
  quantity: number; // 남은 양
  unit: string;
  updatedAt: string | null;
}

// 현장 목록에 보이는 요약 정보
export interface SiteSummary {
  id: string;
  name: string;
  address: string;
  ownerName: string;
  memberCount: number;
  overallProgress: number;
  isOwner: boolean; // 이 현장의 관리자(만든 사람). 아니면 작업자로 참여
  workType: string | null; // 공사 종류
  lastReportedAt: string | null; // 마지막 보고(ISO 날짜)
  hqName: string | null; // 연결된 본사(없으면 본사 없이 운영)
  pendingMaterials: number; // 승인·반려를 기다리는 자재 요청 수
  pendingReviews?: number; // 내가 검토할 수 있는 대기 보고 수
  progressMode?: ProgressMode;
}

export interface UpdateSiteInput {
  name: string;
  address: string;
  workType?: string;
}

// 현장 참여자
export interface Member {
  id: string;
  name: string;
  phone: string;
  role: Role;
  isOwner: boolean;
  joinedAt: string; // ISO 날짜
  reportCount: number; // 이 현장에서 제출한 보고 수
}

// 코드 입력 후 참여 전에 보여주는 미리보기
export interface SitePreview {
  id: string;
  name: string;
  address: string;
  ownerName: string;
  memberCount: number;
  alreadyJoined: boolean;
}

export interface CreateSiteInput {
  name: string;
  address: string;
  workType: string; // 목록에서 고르거나 직접 입력
  progressMode?: ProgressMode;
  processes?: ProcessInput[]; // 자동 계산이면 공정·가중치(합 100)
  materials?: MaterialItem[]; // 지금 현장에 있는 자재 양(최고 책임자가 입력, 선택)
}

// 보고에 첨부한 문서(엑셀·PDF 등)
export interface ReportFile {
  name: string; // 원래 파일 이름
  url: string; // 내려받는 주소
  size: number; // 바이트
}

// 보고 작성 중 휴대폰에서 고른 파일
export interface PickedFile {
  uri: string;
  name: string;
  type: string | null;
  size: number | null;
}

export interface Report {
  id: string;
  siteId: string;
  siteName?: string;
  /** 예전 방식(공정 선택) 보고의 공정. 새 보고는 'work' */
  processKey: string;
  processName: string;
  /** 진행한 작업(직접 입력) */
  work: string;
  from: number; // 보고 전 현장 전체 진행률
  to: number; // 보고 후(직접 입력 값 또는 자동 계산 값)
  /** 자동 계산 현장: 보고한 공정의 진행률(보고 전 → 후). 직접 입력이면 없음 */
  processFrom?: number | null;
  processTo?: number | null;
  photoUris: string[];
  files: ReportFile[];
  memo: string;
  workLog: WorkLog;
  author: string;
  authorId: string;
  createdAt: string; // ISO 날짜
  updatedAt?: string; // 메모를 고친 시각
  /** 사진별 촬영 정보(촬영 시각·위치). 없을 수 있다 */
  photos?: PhotoInfo[];
  /** 보고를 제출한 위치(휴대폰 GPS) */
  location?: GeoPoint | null;
  /** 검토(승인·보완 요청) */
  review?: Review;
  /** 촬영 시각·위치로 찾은 의심스러운 점(오래된 사진, 현장 밖 제출 등) */
  checks?: ReportCheck[];
  /** 현장 관리자가 매긴 오늘 작업 평점(0.5~5.0). 없으면 null */
  rating?: number | null;
  /** 오늘 사용한 자재(승인되면 현장 재고에서 빠진다) */
  materialUsages?: MaterialItem[];
  // 서버가 로그인한 사용자 기준으로 계산해서 내려주는 권한
  canEdit: boolean; // 작성자 본인
  canDelete: boolean; // (작성자 또는 현장 관리자) + 그 공정의 가장 최근 보고
  canReview?: boolean; // 연결된 본사 또는 현장 총관리자 + 검토 대기 + 본인 보고 아님
}

// ---- 보고 검토 ----
// 대기 → 승인 / 보완 요청(작성자가 메모를 고치면 다시 대기)
export type ReviewStatus = 'pending' | 'approved' | 'revision';

export interface Review {
  status: ReviewStatus;
  comment: string | null;
  reviewer: string | null;
  reviewedAt: string | null;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

export interface PhotoInfo {
  url: string;
  takenAt: string | null;
  latitude: number | null;
  longitude: number | null;
  /** 작업 전 / 작업 후(예전 보고는 구분 없음) */
  phase?: PhotoPhase | null;
}

export type PhotoPhase = 'before' | 'after';

export interface ReportCheck {
  type: 'old_photo' | 'far_submit' | 'far_photo' | 'no_location';
  message: string;
}

export interface NewReport {
  siteId: string;
  work: string; // 진행한 작업(자동 계산 현장은 비워도 됨)
  to: number; // 직접 입력: 현장 전체 진행률(%)
  processKey?: string; // 자동 계산: 보고할 공정
  processTo?: number; // 자동 계산: 그 공정의 진행률(%)
  photoUris: string[];
  /** 사진마다 촬영 시각(ISO). 모르면 null */
  photoTakenAt?: (string | null)[];
  /** 사진마다 작업 전 / 작업 후 */
  photoPhases?: PhotoPhase[];
  /** 현장 관리자의 오늘 작업 평점(0.5~5.0, 안 매기면 null) */
  rating?: number | null;
  /** 오늘 사용한 자재 */
  materials?: MaterialItem[];
  /** 제출 위치(위치 권한을 안 주면 null) */
  location?: GeoPoint | null;
  files: PickedFile[];
  memo: string;
  workLog: WorkLog;
}

// ---- 자재 요청 ----

// 요청 → 승인 / 반려 (현장 총관리자나 연결된 본사 관계자가 처리)
export type MaterialStatus = 'requested' | 'approved' | 'rejected';

export interface MaterialItem {
  name: string;
  quantity: number;
  unit: string; // 톤, 개, 본, ㎥ …
}

// 처리 이력 한 줄
export interface MaterialEvent {
  status: MaterialStatus;
  by: string; // 처리한 사람
  byHq: boolean; // 본사에서 처리
  at: string; // ISO 날짜
}

export interface MaterialRequest {
  id: string;
  siteId: string;
  siteName: string;
  processKey: string | null; // 없으면 현장 공통
  processName: string | null;
  items: MaterialItem[];
  neededBy: string | null; // 'YYYY-MM-DD'
  urgent: boolean;
  note: string;
  status: MaterialStatus;
  rejectReason: string | null;
  author: string;
  authorId: string;
  createdAt: string; // ISO 날짜
  timeline: MaterialEvent[]; // 처리 이력(오래된 순)
  hqLinked: boolean; // 현장이 본사에 연결됨(본사도 승인·반려 가능)
  // 서버가 로그인한 사용자 기준으로 계산해서 내려주는 권한
  canCancel: boolean; // 처리 전 본인 요청
  canApprove: boolean; // 총관리자·본사: 승인
  canReject: boolean; // 총관리자·본사: 반려
}

// 본사 정보(본사 관계자 화면)
export interface HqInfo {
  name: string;
  code: string; // 6자리 본사 코드
  siteCount: number;
  staff: string[]; // 본사 관계자 이름
}

export interface NewMaterialRequest {
  siteId: string;
  processKey: string | null;
  items: MaterialItem[];
  neededBy: string | null;
  urgent: boolean;
  note: string;
}

// 보고 이력 나눠 불러오기(한 번에 30건씩)
export interface ReportPage {
  items: Report[];
  /** 다음 묶음을 부를 때 넘기는 값. 더 없으면 null */
  nextCursor: string | null;
  /** 첫 묶음에만: 전체 보고 수 */
  total: number | null;
}

/** 현장별 마지막으로 본 시각(ISO). 한 번도 안 봤으면 null */
export type SeenInput = Record<string, string | null>;
