// 서버 API 응답 모양 (모바일 앱 BuildUpApp/src/types.ts 에서 가져와 웹에 맞게 줄임)

export type Role = 'admin' | 'worker' | 'hq';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  company?: string | null;
  companyCode?: string | null;
  hqName?: string | null;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// 예전 데이터의 공정 키(새 보고는 'work'). 화면에는 보고의 work(진행한 작업)를 보여 준다.
export type ProcessKey = string;

export type Weather = 'sunny' | 'cloudy' | 'rain' | 'snow';

export interface WorkLog {
  weather: Weather | null;
  workers: number | null;
  equipment: string;
}

export interface Site {
  id: string;
  name: string;
  address: string;
  ownerId: string;
  ownerName: string;
  code: string | null;
  memberCount: number;
  overallProgress: number; // 현장 전체 진행률(보고자가 보고마다 직접 입력)
  workType: string; // 공사 종류
  lastReportedAt: string | null;
  hqName: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface SiteSummary {
  id: string;
  name: string;
  address: string;
  ownerName: string;
  memberCount: number;
  overallProgress: number;
  isOwner: boolean;
  workType: string;
  lastReportedAt: string | null;
  hqName: string | null;
  pendingMaterials: number;
  pendingReviews?: number;
}

export interface ReportFile {
  name: string;
  url: string;
  size: number;
}

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
}

export interface ReportCheck {
  type: string; // old_photo | far_submit | far_photo | no_location
  message: string;
}

export interface Report {
  id: string;
  siteId: string;
  siteName?: string;
  processKey: ProcessKey; // 예전 데이터 호환용
  processName: string; // 예전 데이터 호환용(새 보고는 work 를 줄인 글)
  work: string; // 진행한 작업
  from: number; // 이 보고 전 현장 전체 진행률
  to: number; // 이 보고 후 현장 전체 진행률
  photoUris: string[];
  photos?: PhotoInfo[];
  files: ReportFile[];
  memo: string;
  workLog: WorkLog | null;
  author: string;
  authorId: string;
  createdAt: string;
  updatedAt?: string | null;
  location?: GeoPoint | null;
  review?: Review | null;
  checks?: ReportCheck[];
  canEdit: boolean;
  canDelete: boolean;
  canReview?: boolean;
}

export interface ReportPage {
  items: Report[];
  nextCursor: string | null;
  total: number | null; // 첫 페이지에만 들어 있음
}

export type MaterialStatus = 'requested' | 'approved' | 'rejected';

export interface MaterialItem {
  name: string;
  quantity: number;
  unit: string;
}

export interface MaterialEvent {
  status: MaterialStatus;
  by: string;
  byHq: boolean;
  at: string;
}

export interface MaterialRequest {
  id: string;
  siteId: string;
  siteName: string;
  processKey: ProcessKey | null;
  processName: string | null;
  items: MaterialItem[];
  neededBy: string | null;
  urgent: boolean;
  note: string;
  status: MaterialStatus;
  rejectReason: string | null;
  author: string;
  authorId: string;
  createdAt: string;
  timeline: MaterialEvent[];
  hqLinked: boolean;
  canCancel: boolean;
  canApprove: boolean;
  canReject: boolean;
}

export interface HqInfo {
  name: string;
  code: string;
  siteCount: number;
  staff: string[];
}
