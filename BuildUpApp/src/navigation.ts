import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { KakaoSignup, Report, Role } from './types';

// 로그인 전 화면
export type AuthStackParamList = {
  Login: undefined;
  RoleSelect: { kakao?: KakaoSignup } | undefined; // 카카오로 처음 온 사람은 kakao를 들고 온다
  SignUp: { role: Role; kakao?: KakaoSignup };
  Server: undefined; // 개발용: 로그인 화면 로고를 길게 눌러 연다
};

// (로그인 후) 현장 관리자 전환·보고 체계 변경은 AppStack에

// 로그인 후 화면
export type AppStackParamList = {
  Sites: undefined;
  Profile: undefined;
  PasswordReset: undefined; // 내 정보 → 비밀번호 찾기
  AddSite: undefined; // 공사 현장 추가: 작업자 / 관리자 고르기
  CreateSite: undefined;
  SiteCode: {
    siteId: string;
    siteName: string;
    code: string;
    isNew?: boolean;
  };
  SiteSettings: { siteId: string };
  ProgressMode: { siteId: string }; // 진행률 계산 방식(직접 입력 / 자동 계산)·공정 가중치
  JoinSite: undefined;
  Report: { siteId: string };
  History: { siteId: string; siteName: string };
  Progress: { siteId: string; siteName: string };
  ReportDetail: { report: Report };
  Members: { siteId: string; siteName: string; isOwner: boolean };
  Materials: { siteId: string; siteName: string };
  ManagerSetup: { next?: 'CreateSite' } | undefined; // 현장 관리자로 전환 / 보고 체계 변경 (next: 전환 뒤 갈 화면)
  // 본사 관계자 화면
  HqHome: undefined;
  HqReports: { siteId?: string; siteName?: string }; // siteId가 없으면 전체 현장
  MaterialRequest: {
    siteId: string;
    siteName: string;
  };
};

export type RootStackParamList = AuthStackParamList & AppStackParamList;

export type ScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
