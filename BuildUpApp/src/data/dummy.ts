// DB 연동 전까지 쓰는 더미 데이터(데모 모드). 서버(buildup-server)와 같은 규칙으로 동작한다.
// 변경 내용은 폰 저장소(AsyncStorage)에 저장되어 앱을 껐다 켜도 유지된다(src/data/storage.ts).
// '내 정보 > 데모 데이터 초기화'로 처음 상태로 되돌릴 수 있다.
//
// 테스트 계정(비밀번호 모두 1234)
//   본사 관계자: hq@buildup.kr   → 한빛건설 본사(본사 코드 250901), 한빛·세종 현장 연결됨
//   현장 관리자(본사 보고)  : admin@buildup.kr → 현장 2곳 운영, 한빛건설 본사에 보고
//   현장 관리자(최고 책임자): park@buildup.kr → 박철근 인력사무소, 원주 단독주택(코드 615203) 운영,
//                             한빛 현장에는 작업자로 참여
//   작업자    : worker@buildup.kr → '한빛 오피스텔'에만 참여, '세종 물류센터'는 코드 731046으로 참여 가능
//   (한빛 현장에는 작업자 박철근 park@ · 최전기 choi@ 도 참여 중)
import {
  CreateSiteInput,
  HqInfo,
  ManagerInput,
  MaterialEvent,
  MaterialItem,
  MaterialRequest,
  MaterialStatus,
  Member,
  NewMaterialRequest,
  NewReport,
  ProcessInput,
  ProgressMode,
  Report,
  ReportPage,
  Role,
  SeenInput,
  SignUpInput,
  Site,
  SiteProcess,
  SitePreview,
  SiteSummary,
  UpdateSiteInput,
  User,
  Weather,
} from '../types';
import { addDays, toYMD } from '../utils/plan';

// 개발·시연용 데모 인테리어 현장의 고정 참여 코드(재발급 불가)
export const DEMO_CODE = '000000';

// 공정(자동 계산 방식). 가중치는 상대값(합으로 나눠 계산)
interface Process {
  key: string;
  name: string;
  weight: number;
  progress: number;
  lastReportedAt: string | null;
  planStart: string | null;
  planEnd: string | null;
}

export const MAX_PHOTOS = 10;
export const MAX_MATERIAL_ITEMS = 20;

export class ApiError extends Error {}

interface UserRow extends Omit<User, 'companyCode'> {
  password: string;
  hqCompanyId?: string; // 본사 관계자만
  managerCompanyId?: string | null; // 현장 관리자만: 보고하는 본사(없으면 최고 책임자)
}

interface CompanyRow {
  id: string;
  name: string;
  code: string; // 6자리 본사 코드
}

interface SiteRow {
  id: string;
  name: string;
  address: string;
  ownerId: string;
  code: string;
  companyId: string | null; // 연결된 본사
  latitude?: number | null; // 현장 위치
  longitude?: number | null;
  memberIds: string[];
  joinedAt: Record<string, string>; // 사용자 id → 참여 시각
  processes: Process[]; // 자동 계산 방식의 공정(직접 입력으로 바꿔도 남겨 둔다)
  progress?: number; // 현장 전체 진행률(직접 입력 값, 자동이면 마지막 계산값)
  progressMode?: ProgressMode; // 없으면 직접 입력
  workType?: string | null; // 공사 종류
  lastReportedAt?: string | null;
}

type ReportRow = Omit<
  Report,
  'canEdit' | 'canDelete' | 'canReview' | 'siteName' | 'checks'
>;
type MaterialRow = Omit<
  MaterialRequest,
  'siteName' | 'hqLinked' | 'canCancel' | 'canApprove' | 'canReject'
>;

export interface DummyState {
  users: UserRow[];
  companies: CompanyRow[];
  sites: SiteRow[];
  reports: ReportRow[];
  materials: MaterialRow[];
}

const hourAt = (days: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

// 오늘 기준 n일 뒤 날짜('YYYY-MM-DD', 음수면 과거)
const ymdFromToday = (n: number) => toYMD(addDays(new Date(), n));

// 새 현장의 기본 공정(비중: 골조 40%, 나머지 각 20%, 계획 미설정)
function defaultProcesses(progress = [0, 0, 0, 0]): Process[] {
  const base: [Process['key'], string, number][] = [
    ['frame', '골조', 0.4],
    ['electric', '전기', 0.2],
    ['plumbing', '설비', 0.2],
    ['finish', '마감', 0.2],
  ];
  return base.map(([key, name, weight], i) => ({
    key,
    name,
    weight,
    progress: progress[i],
    lastReportedAt: null,
    planStart: null,
    planEnd: null,
  }));
}

const setPlan = (p: Process, startFromToday: number, endFromToday: number) => {
  p.planStart = ymdFromToday(startFromToday);
  p.planEnd = ymdFromToday(endFromToday);
};

// ---- 보고 이력 자동 생성(그래프용) ----

interface HistorySpec {
  key: Process['key'];
  name: string;
  final: number; // 현재 진행률
  lastDaysAgo: number; // 가장 최근 보고일
  every: number; // 며칠마다 보고
  count: number;
  authors: [string, string][]; // [id, 이름] 순환
  memos: string[]; // 최근 보고부터 순서대로
}

const STEPS = [
  1.5, 1.0, 2.0, 1.5, 0.5, 2.5, 1.0, 1.5, 2.0, 1.0, 1.5, 0.5, 2.0, 1.5, 1.0,
];
const WEATHERS: Weather[] = [
  'sunny',
  'sunny',
  'cloudy',
  'sunny',
  'rain',
  'cloudy',
  'sunny',
];

function makeHistory(
  siteId: string,
  spec: HistorySpec,
  seq: { n: number },
  ownerId: string,
) {
  const rows: ReportRow[] = [];
  let to = spec.final;
  for (let i = 0; i < spec.count; i++) {
    const inc = STEPS[(i + spec.key.length) % STEPS.length];
    const from = Math.round((to - inc) * 10) / 10;
    const [authorId, author] = spec.authors[i % spec.authors.length];
    rows.push({
      id: `r-seed-${seq.n++}`,
      siteId,
      processKey: spec.key,
      processName: spec.name,
      work: `${spec.name} 작업`,
      from,
      to,
      photoUris: [],
      files: [],
      memo: spec.memos[i] ?? '',
      workLog: {
        weather: WEATHERS[(i + spec.every) % WEATHERS.length],
        workers: 4 + ((i * 3 + spec.key.length) % 9),
        equipment:
          spec.key === 'frame' && i % 2 === 0 ? '타워크레인 1, 펌프카 1' : '',
      },
      author,
      authorId,
      createdAt: hourAt(spec.lastDaysAgo + i * spec.every, 16 + (i % 2)),
      review: {
        status: i === 0 && authorId !== ownerId ? 'pending' : 'approved',
        comment: null,
        reviewer: null,
        reviewedAt: null,
      },
    });
    to = from;
  }
  return rows;
}

// ---- 처음 상태(데모 데이터) ----

const KIM: [string, string] = ['u-worker', '김현장'];
const PARK: [string, string] = ['u-w2', '박철근'];
const CHOI: [string, string] = ['u-w3', '최전기'];
const LEE: [string, string] = ['u-admin', '이영호'];
const JUNG: [string, string] = ['u-hq', '정본사'];

function makeSeed(): DummyState {
  const users: UserRow[] = [
    {
      id: 'u-hq',
      name: '정본사',
      email: 'hq@buildup.kr',
      phone: '010-7777-8888',
      role: 'hq',
      hqCompanyId: 'c-1',
      password: '1234',
    },
    {
      id: 'u-admin',
      name: '이영호',
      email: 'admin@buildup.kr',
      phone: '010-1234-5678',
      role: 'admin',
      company: '한빛건설',
      managerCompanyId: 'c-1', // 본사에 보고
      password: '1234',
    },
    {
      id: 'u-worker',
      name: '김현장',
      email: 'worker@buildup.kr',
      phone: '010-9876-5432',
      role: 'worker',
      password: '1234',
    },
    {
      id: 'u-w2',
      name: '박철근',
      email: 'park@buildup.kr',
      phone: '010-2222-3333',
      role: 'admin', // 최고 책임자(본사 없음), 한빛에서는 작업자
      company: '박철근 인력사무소',
      password: '1234',
    },
    {
      id: 'u-w3',
      name: '최전기',
      email: 'choi@buildup.kr',
      phone: '010-4444-5555',
      role: 'worker',
      password: '1234',
    },
  ];

  const companies: CompanyRow[] = [
    { id: 'c-1', name: '한빛건설 본사', code: '250901' },
  ];

  const hanbitSpecs: HistorySpec[] = [
    {
      key: 'frame',
      name: '골조',
      final: 68.5,
      lastDaysAgo: 1,
      every: 2,
      count: 15,
      authors: [KIM, PARK],
      memos: [
        '8층 슬래브 타설 완료. 우천 대비 양생포 설치.',
        '7층 벽체 거푸집 해체, 8층 철근 배근 시작.',
        '7층 슬래브 타설.',
        '6층 기둥 철근 검측 완료.',
      ],
    },
    {
      key: 'electric',
      name: '전기',
      final: 35.0,
      lastDaysAgo: 1,
      every: 3,
      count: 10,
      authors: [KIM, CHOI],
      memos: ['5~6층 배관 입선 작업.', '3~4층 분전반 설치 완료.'],
    },
    {
      key: 'plumbing',
      name: '설비',
      final: 28.5,
      lastDaysAgo: 2,
      every: 4,
      count: 7,
      authors: [KIM, PARK],
      memos: ['', '지하 1층 급수 배관 설치.'],
    },
    {
      key: 'finish',
      name: '마감',
      final: 15.5,
      lastDaysAgo: 3,
      every: 5,
      count: 6,
      authors: [LEE, KIM],
      memos: ['2층 내벽 석고보드 시공.', '1층 방수 1차 완료.'],
    },
  ];
  const sejongSpecs: HistorySpec[] = [
    {
      key: 'frame',
      name: '골조',
      final: 92.0,
      lastDaysAgo: 1,
      every: 3,
      count: 5,
      authors: [LEE],
      memos: ['증축동 지붕 트러스 설치 완료.', '3층 데크플레이트 타설.'],
    },
    {
      key: 'electric',
      name: '전기',
      final: 60.5,
      lastDaysAgo: 2,
      every: 4,
      count: 4,
      authors: [LEE],
      memos: ['수배전반 반입·설치.'],
    },
  ];

  // 한빛: 골조·전기 지연, 설비 앞섬, 마감 정상 → 전체 '지연'
  const hanbit = defaultProcesses(hanbitSpecs.map(s => s.final));
  hanbitSpecs.forEach((s, i) => {
    hanbit[i].lastReportedAt = hourAt(s.lastDaysAgo, 16);
  });
  setPlan(hanbit[0], -60, 20);
  setPlan(hanbit[1], -40, 60);
  setPlan(hanbit[2], -30, 90);
  setPlan(hanbit[3], -20, 100);

  // 세종: 대부분 앞섬
  const sejong = defaultProcesses([92.0, 60.5, 55.0, 30.0]);
  sejongSpecs.forEach((s, i) => {
    sejong[i].lastReportedAt = hourAt(s.lastDaysAgo, 16);
  });
  setPlan(sejong[0], -120, 10);
  setPlan(sejong[1], -60, 60);
  setPlan(sejong[2], -60, 60);
  setPlan(sejong[3], -30, 90);

  const sites: SiteRow[] = [
    {
      id: 'site-1',
      name: '한빛 오피스텔 신축공사',
      address: '강원 원주시 무실동 123-4',
      ownerId: 'u-admin',
      code: '482915',
      companyId: 'c-1',
      memberIds: ['u-admin', 'u-worker', 'u-w2', 'u-w3'],
      joinedAt: {
        'u-admin': hourAt(60, 9),
        'u-worker': hourAt(45, 8),
        'u-w2': hourAt(40, 8),
        'u-w3': hourAt(35, 8),
      },
      processes: hanbit,
    },
    {
      id: 'site-2',
      name: '세종 물류센터 증축공사',
      address: '세종시 연서면 산단로 56',
      ownerId: 'u-admin',
      code: '731046',
      companyId: 'c-1',
      memberIds: ['u-admin'],
      joinedAt: { 'u-admin': hourAt(120, 9) },
      processes: sejong,
    },
  ];

  // 최고 책임자(박철근)의 작은 현장: 공정도 직접 만든 예시
  const wonju: Process[] = [
    {
      key: 'demolish',
      name: '철거',
      weight: 20,
      progress: 100,
      lastReportedAt: hourAt(9, 16),
      planStart: ymdFromToday(-20),
      planEnd: ymdFromToday(-10),
    },
    {
      key: 'piping',
      name: '설비 교체',
      weight: 30,
      progress: 55,
      lastReportedAt: hourAt(1, 16),
      planStart: ymdFromToday(-12),
      planEnd: ymdFromToday(8),
    },
    {
      key: 'interior',
      name: '내장 마감',
      weight: 50,
      progress: 10,
      lastReportedAt: hourAt(0, 9),
      planStart: ymdFromToday(0),
      planEnd: ymdFromToday(25),
    },
  ];
  sites.push({
    id: 'site-3',
    name: '원주 단독주택 리모델링',
    address: '강원 원주시 단구동 45-2',
    ownerId: 'u-w2',
    code: '615203',
    companyId: null,
    memberIds: ['u-w2', 'u-worker'],
    joinedAt: { 'u-w2': hourAt(25, 8), 'u-worker': hourAt(20, 8) },
    processes: wonju,
  });
  const wonjuSpecs: HistorySpec[] = [
    {
      key: 'demolish',
      name: '철거',
      final: 100,
      lastDaysAgo: 9,
      every: 2,
      count: 5,
      authors: [KIM, PARK],
      memos: ['철거 완료, 폐기물 반출.'],
    },
    {
      key: 'piping',
      name: '설비 교체',
      final: 55,
      lastDaysAgo: 1,
      every: 2,
      count: 5,
      authors: [KIM, PARK],
      memos: ['욕실 급배수 배관 교체.', '주방 배관 교체.'],
    },
    {
      key: 'interior',
      name: '내장 마감',
      final: 10,
      lastDaysAgo: 0,
      every: 1,
      count: 1,
      authors: [PARK],
      memos: ['거실 벽지 제거 시작.'],
    },
  ];

  // 개발·시연용 인테리어 현장: 참여 코드 000000 고정(재발급 불가), 진행률 0%에서 시작 (서버 DemoDataSeeder와 같음)
  sites.push({
    id: 'site-demo',
    name: '데모 인테리어 현장 (아파트 리모델링)',
    address: '강원 원주시 단계동 데모아파트 101동 1203호',
    ownerId: 'u-admin',
    code: DEMO_CODE,
    companyId: 'c-1',
    memberIds: ['u-admin', 'u-worker'],
    joinedAt: { 'u-admin': hourAt(0, 8), 'u-worker': hourAt(0, 8) },
    processes: [],
  });

  const seq = { n: 1 };
  const reports = [
    ...hanbitSpecs.flatMap(s => makeHistory('site-1', s, seq, 'u-admin')),
    ...sejongSpecs.flatMap(s => makeHistory('site-2', s, seq, 'u-admin')),
    ...wonjuSpecs.flatMap(s => makeHistory('site-3', s, seq, 'u-w2')),
  ];

  toSiteLevel(sites, reports);
  return { users, companies, sites, reports, materials: seedMaterials() };
}

// 서버 SiteProgressMigration과 같은 방식: 보고마다 그 시점의 현장 전체 진행률(보고 전 → 후)
const DEMO_WORK_TYPES: Record<string, string> = {
  '482915': '건축 신축 공사',
  '731046': '증축 공사',
  '615203': '주택 리모델링 공사',
  [DEMO_CODE]: '아파트 리모델링',
};
function toSiteLevel(siteRows: SiteRow[], reportRows: ReportRow[]) {
  for (const site of siteRows) {
    const weights = new Map(site.processes.map(p => [p.key, p.weight]));
    const progress = new Map(site.processes.map(p => [p.key, p.progress]));
    const rows = reportRows
      .filter(r => r.siteId === site.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const started = new Set<string>();
    rows.forEach(r => {
      if (!started.has(r.processKey)) {
        started.add(r.processKey);
        progress.set(r.processKey, r.from);
      }
    });
    const weighted = () => {
      let sum = 0;
      let total = 0;
      weights.forEach((w, k) => {
        sum += (progress.get(k) ?? 0) * w;
        total += w;
      });
      return total > 0 ? Math.round((sum / total) * 10) / 10 : 0;
    };
    rows.forEach(r => {
      const before = weighted();
      progress.set(r.processKey, r.to);
      r.from = before;
      r.to = Math.max(before, weighted());
    });
    site.progress = legacyOverall(site.processes);
    site.lastReportedAt = rows.length ? rows[rows.length - 1].createdAt : null;
    site.workType = DEMO_WORK_TYPES[site.code] ?? '기타 공사';
    if (site.code === AUTO_DEMO_CODE) {
      // 자동 계산(공정 가중치) 예시 현장: 공정을 남겨 두고 자동 계산 방식으로 (서버 DemoDataSeeder와 같음)
      site.progressMode = 'auto';
    } else {
      site.processes = [];
    }
  }
}
const AUTO_DEMO_CODE = '482915';

// 자재 요청 예시: 승인 대기·승인·반려가 골고루 보이도록(서버 DemoDataSeeder와 같은 내용)
function seedMaterials(): MaterialRow[] {
  const NAMES: Record<Process['key'], string> = {
    frame: '골조',
    electric: '전기',
    plumbing: '설비',
    finish: '마감',
  };
  // [상태, 처리한 사람, 본사 처리 여부, 며칠 전, 시]
  type Step = [MaterialStatus, [string, string], boolean, number, number];
  let n = 1;
  const row = (
    siteId: string,
    key: Process['key'],
    [authorId, author]: [string, string],
    neededInDays: number | null,
    urgent: boolean,
    note: string,
    rejectReason: string | null,
    items: MaterialItem[],
    steps: Step[],
  ): MaterialRow => ({
    id: `m-seed-${n++}`,
    siteId,
    processKey: key,
    processName: NAMES[key],
    items,
    neededBy: neededInDays === null ? null : ymdFromToday(neededInDays),
    urgent,
    note,
    status: steps[steps.length - 1][0],
    rejectReason,
    author,
    authorId,
    createdAt: hourAt(steps[0][3], steps[0][4]),
    timeline: steps.map(([status, [, by], byHq, days, hour]) => ({
      status,
      by,
      byHq,
      at: hourAt(days, hour),
    })),
  });
  const item = (name: string, quantity: number, unit: string) => ({
    name,
    quantity,
    unit,
  });
  return [
    // 승인 대기(작업자 요청 → 총관리자나 본사가 처리)
    row(
      'site-1',
      'electric',
      CHOI,
      1,
      true,
      '5층 입선 작업분이 모자라요.',
      null,
      [item('전선 HFIX 2.5sq', 10, '롤'), item('CD관 22mm', 30, '본')],
      [['requested', CHOI, false, 0, 8]],
    ),
    row(
      'site-1',
      'frame',
      KIM,
      2,
      false,
      '9층 슬래브 배근용',
      null,
      [item('철근 HD13', 5, '톤'), item('결속선', 10, '롤')],
      [['requested', KIM, false, 0, 7]],
    ),
    // 승인 대기(총관리자 본인 요청 → 본사가 처리)
    row(
      'site-1',
      'frame',
      LEE,
      1,
      true,
      '10층 거푸집 전용. 오전 반입 부탁드립니다.',
      null,
      [item('유로폼 600×1200', 200, '장'), item('각재 50×50', 150, '본')],
      [['requested', LEE, false, 0, 9]],
    ),
    row(
      'site-2',
      'frame',
      LEE,
      5,
      false,
      '증축동 2차 철골',
      null,
      [item('H형강 300×300', 12, '톤')],
      [['requested', LEE, false, 1, 10]],
    ),
    // 승인
    row(
      'site-1',
      'plumbing',
      PARK,
      3,
      false,
      '',
      null,
      [item('PVC관 100mm', 20, '본')],
      [
        ['requested', PARK, false, 1, 15],
        ['approved', LEE, false, 1, 17],
      ],
    ),
    row(
      'site-1',
      'finish',
      KIM,
      2,
      false,
      '3층 내벽용',
      null,
      [item('석고보드 9.5T', 120, '장')],
      [
        ['requested', KIM, false, 3, 10],
        ['approved', JUNG, true, 2, 11],
      ],
    ),
    // 반려
    row(
      'site-1',
      'finish',
      PARK,
      null,
      false,
      '2층 내벽용',
      '이미 요청된 자재예요',
      [item('석고보드 9.5T', 100, '장')],
      [
        ['requested', PARK, false, 3, 9],
        ['rejected', LEE, false, 3, 12],
      ],
    ),
  ];
}

let { users, companies, sites, reports, materials } = makeSeed();

// ---- 저장/복원(storage.ts에서 사용) ----

export const dummyState = {
  export(): DummyState {
    return { users, companies, sites, reports, materials };
  },
  import(s: DummyState) {
    ({ users, companies, sites, reports, materials } = s);
  },
  reset() {
    ({ users, companies, sites, reports, materials } = makeSeed());
  },
};

// ---- 내부 도우미 ----

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// 비중은 상대값이라 합으로 나눈다(공정이 없으면 0)
// 함수 선언(맨 위로 끌어올려짐): 데모 데이터를 만들 때(파일을 읽자마자) 쓴다
function legacyOverall(processes: Process[]) {
  const total = processes.reduce((acc, p) => acc + p.weight, 0);
  if (total <= 0) {
    return 0;
  }
  return (
    Math.round(
      (processes.reduce((acc, p) => acc + p.progress * p.weight, 0) / total) *
        10,
    ) / 10
  );
}

// 비밀번호는 밖으로 내보내지 않는다
function publicUser(row: UserRow): User {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, hqCompanyId, managerCompanyId, ...u } = row;
  const hq = hqCompanyId ? companies.find(c => c.id === hqCompanyId) : null;
  const reportsTo =
    u.role === 'admin' && managerCompanyId
      ? companies.find(c => c.id === managerCompanyId)?.name ?? null
      : null;
  return clone(
    hq
      ? { ...u, company: hq.name, companyCode: hq.code }
      : { ...u, hqName: reportsTo },
  );
}

function findUser(userId: string) {
  const u = users.find(x => x.id === userId);
  if (!u) {
    throw new ApiError('로그인이 필요합니다.');
  }
  return u;
}

// 이 현장이 연결된 본사의 관계자인가
const isHqOf = (u: UserRow | undefined, s: SiteRow) =>
  !!u?.hqCompanyId && s.companyId === u.hqCompanyId;

// 참여한 현장만 접근 가능(보고 제출·자재 요청 등)
function findMemberSite(userId: string, siteId: string) {
  const s = sites.find(x => x.id === siteId);
  if (!s || !s.memberIds.includes(userId)) {
    throw new ApiError('참여하지 않은 현장입니다.');
  }
  return s;
}

// 조회만: 참여자 또는 이 현장이 연결된 본사의 관계자
function findViewableSite(userId: string, siteId: string) {
  const s = sites.find(x => x.id === siteId);
  const u = users.find(x => x.id === userId);
  if (!s || !(s.memberIds.includes(userId) || isHqOf(u, s))) {
    throw new ApiError('볼 수 있는 현장이 아닙니다.');
  }
  return s;
}

function findOwnedSite(userId: string, siteId: string, action: string) {
  const s = findMemberSite(userId, siteId);
  if (s.ownerId !== userId) {
    throw new ApiError(`현장 총관리자만 ${action}할 수 있습니다.`);
  }
  return s;
}

function findHqCompany(userId: string) {
  const u = findUser(userId);
  const c = companies.find(x => x.id === u.hqCompanyId);
  if (u.role !== 'hq' || !c) {
    throw new ApiError('본사 관계자만 볼 수 있어요.');
  }
  return c;
}

// 겹치지 않는 6자리 숫자 코드
function newCode(taken: (code: string) => boolean) {
  let code: string;
  do {
    code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  } while (code === DEMO_CODE || taken(code));
  return code;
}

const ownerName = (s: SiteRow) =>
  users.find(u => u.id === s.ownerId)?.name ?? '-';

const siteName = (siteId: string) =>
  sites.find(s => s.id === siteId)?.name ?? '';

// 해당 공정의 가장 최근 보고
// 현장의 가장 최근 보고
const latestOf = (siteId: string) =>
  reports
    .filter(r => r.siteId === siteId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

// 로그인한 사용자 기준 권한을 붙여서 내려준다
function withPermissions(userId: string, row: ReportRow): Report {
  const site = sites.find(s => s.id === row.siteId);
  const isAuthor = row.authorId === userId;
  const isLatest = latestOf(row.siteId)?.id === row.id;
  const review = row.review ?? {
    status: 'approved' as const,
    comment: null,
    reviewer: null,
    reviewedAt: null,
  };
  // 검토: 연결된 본사 또는 현장 총관리자, 본인 보고는 안 됨(서버 ReportService.canReview와 같음)
  const viewer = users.find(u => u.id === userId);
  const canReview =
    !!site &&
    review.status === 'pending' &&
    !isAuthor &&
    (site.ownerId === userId || isHqOf(viewer, site));
  return {
    ...clone(row),
    review: clone(review),
    siteName: siteName(row.siteId),
    checks: [],
    canEdit: isAuthor,
    canDelete: isLatest && (isAuthor || site?.ownerId === userId),
    canReview,
  };
}

// 현장 전체 진행률: 자동 계산이면 공정 가중치로, 직접 입력이면 입력한 값
const overallOf = (s: SiteRow) =>
  s.progressMode === 'auto' ? legacyOverall(s.processes) : s.progress ?? 0;

function processesOf(s: SiteRow): SiteProcess[] {
  const total = s.processes.reduce((acc, p) => acc + p.weight, 0);
  return s.processes.map(p => ({
    key: p.key,
    name: p.name,
    weight: total > 0 ? Math.round((p.weight / total) * 1000) / 10 : 0,
    progress: p.progress,
    lastReportedAt: p.lastReportedAt,
  }));
}

// 진행률 계산 방식 바꾸기(서버 SiteService.applyMode와 같은 규칙)
function applyMode(s: SiteRow, mode: ProgressMode, input: ProcessInput[]) {
  if (mode === 'manual') {
    s.progress = overallOf(s);
    s.progressMode = 'manual';
    return;
  }
  if (input.length === 0) {
    throw new ApiError('자동 계산을 쓰려면 공정을 하나 이상 넣어 주세요.');
  }
  if (input.length > 12) {
    throw new ApiError('공정은 12개까지 넣을 수 있어요.');
  }
  const names = new Set<string>();
  let sum = 0;
  for (const p of input) {
    const name = (p.name ?? '').trim();
    if (!name || name.length > 30) {
      throw new ApiError('공정 이름은 1~30자로 적어 주세요.');
    }
    if (names.has(name)) {
      throw new ApiError(`공정 이름 '${name}'이(가) 겹쳐요.`);
    }
    names.add(name);
    if (!Number.isFinite(p.weight) || p.weight <= 0) {
      throw new ApiError(`'${name}' 공정의 가중치를 0보다 크게 적어 주세요.`);
    }
    sum += p.weight;
  }
  if (Math.abs(sum - 100) > 0.5) {
    throw new ApiError(
      `가중치 합계가 100%가 되어야 해요. (지금 ${Math.round(sum * 10) / 10}%)`,
    );
  }
  const wasAuto = s.progressMode === 'auto';
  const current = overallOf(s);
  let next =
    Math.max(
      0,
      ...s.processes
        .map(p => /^p(\d+)$/.exec(p.key)?.[1])
        .filter((n): n is string => !!n)
        .map(Number),
    ) + 1;
  s.processes = input.map(p => {
    const old = p.key ? s.processes.find(x => x.key === p.key) : undefined;
    if (old) {
      return {
        ...old,
        name: p.name.trim(),
        weight: p.weight,
        progress: wasAuto ? old.progress : current,
      };
    }
    return {
      key: `p${next++}`,
      name: p.name.trim(),
      weight: p.weight,
      progress: wasAuto ? 0 : current, // 직접 입력에서 바꾸면 지금 진행률에서 시작
      lastReportedAt: null,
      planStart: null,
      planEnd: null,
    };
  });
  s.progressMode = 'auto';
  s.progress = legacyOverall(s.processes);
}

function summary(s: SiteRow, userId: string): SiteSummary {
  return {
    id: s.id,
    name: s.name,
    address: s.address,
    ownerName: ownerName(s),
    memberCount: s.memberIds.length,
    overallProgress: overallOf(s),
    progressMode: s.progressMode ?? 'manual',
    isOwner: s.ownerId === userId,
    hqName: companies.find(c => c.id === s.companyId)?.name ?? null,
    workType: s.workType ?? null,
    lastReportedAt: s.lastReportedAt ?? null,
    // 승인·반려를 기다리는 요청
    pendingMaterials: materials.filter(
      m => m.siteId === s.id && m.status === 'requested',
    ).length,
    pendingReviews: reports.filter(
      r =>
        r.siteId === s.id &&
        r.review?.status === 'pending' &&
        (isHqOf(
          users.find(u => u.id === userId),
          s,
        ) ||
          (s.ownerId === userId && r.authorId !== userId)),
    ).length,
  };
}

// ---- 자재 요청 권한(서버 MaterialDtos.Permissions와 같은 규칙) ----
// 승인·반려: 현장 총관리자 또는 연결된 본사 관계자.
// 단, 본사에 연결된 현장에서 총관리자가 직접 요청한 것은 본사가 처리한다.

function withMaterialPermissions(
  userId: string,
  row: MaterialRow,
): MaterialRequest {
  const site = sites.find(s => s.id === row.siteId)!;
  const viewer = users.find(u => u.id === userId);
  const owner = site.ownerId === userId;
  const hq = isHqOf(viewer, site);
  const linked = !!site.companyId;
  const author = row.authorId === userId;
  const requested = row.status === 'requested';
  const canDecide = requested && (hq || (owner && !(author && linked)));
  return {
    ...clone(row),
    siteName: site.name,
    hqLinked: linked,
    canCancel: author && requested,
    canApprove: canDecide,
    canReject: canDecide,
  };
}

function findMaterial(userId: string, requestId: string) {
  const row = materials.find(m => m.id === requestId);
  if (!row) {
    throw new ApiError('자재 요청을 찾을 수 없습니다.');
  }
  findViewableSite(userId, row.siteId);
  return row;
}

const event = (
  status: MaterialStatus,
  u: UserRow,
  byHq: boolean,
): MaterialEvent => ({
  status,
  by: u.name,
  byHq,
  at: new Date().toISOString(),
});

const byNewest = (a: { createdAt: string }, b: { createdAt: string }) =>
  b.createdAt.localeCompare(a.createdAt);

// ---- 가짜 DB 조작 함수(api 계층에서만 사용) ----

// 나눠 불러오기: 최신순 목록에서 커서 다음부터 size개
const cursorOf = (r: Report) => `${r.createdAt}_${r.id}`;
function pageOf(
  list: Report[],
  cursor: string | null | undefined,
  size = 30,
): { items: Report[]; nextCursor: string | null } {
  const n = Math.max(1, Math.min(size, 50));
  const start = cursor ? list.findIndex(r => cursorOf(r) === cursor) + 1 : 0;
  if (cursor && start === 0) {
    throw new ApiError('목록 위치 값이 올바르지 않습니다.');
  }
  const items = list.slice(start, start + n);
  const more = start + n < list.length;
  return {
    items,
    nextCursor: more && items.length ? cursorOf(items[items.length - 1]) : null,
  };
}

export const dummyDb = {
  getUser(userId: string): User | null {
    const u = users.find(x => x.id === userId);
    return u ? publicUser(u) : null;
  },

  login(email: string, password: string): User {
    const u = users.find(x => x.email === email.trim().toLowerCase());
    if (!u || u.password !== password) {
      throw new ApiError('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    return publicUser(u);
  },

  signUp(input: SignUpInput): User {
    const email = input.email.trim().toLowerCase();
    if (users.some(u => u.email === email)) {
      throw new ApiError('이미 가입된 이메일입니다.');
    }
    // 데모 모드는 인증 토큰을 확인하지 않는다(시연용). 카카오 가입은 서버 모드에서만
    const { companyCode, company } = input;
    const row: UserRow = {
      id: `u-${Date.now()}`,
      role: input.role,
      name: input.name,
      email,
      phone: input.phone,
      password: input.password ?? '',
    };
    if (input.role === 'admin') {
      // 본사 코드가 있으면 그 본사에 보고, 없으면 최고 책임자
      if (companyCode?.trim()) {
        const c = companies.find(x => x.code === companyCode.trim());
        if (!c) {
          throw new ApiError(
            '해당 코드의 본사를 찾을 수 없습니다.\n코드를 다시 확인해 주세요.',
          );
        }
        row.managerCompanyId = c.id;
      }
      row.company =
        company?.trim() ||
        companies.find(c => c.id === row.managerCompanyId)?.name;
    }
    if (input.role === 'hq') {
      // 본사 코드로 합류하거나 새 본사 등록
      if (companyCode?.trim()) {
        const c = companies.find(x => x.code === companyCode.trim());
        if (!c) {
          throw new ApiError(
            '해당 코드의 본사를 찾을 수 없습니다.\n코드를 다시 확인해 주세요.',
          );
        }
        row.hqCompanyId = c.id;
      } else {
        if (!company?.trim()) {
          throw new ApiError('본사명을 입력해 주세요.');
        }
        const c: CompanyRow = {
          id: `c-${Date.now()}`,
          name: company.trim(),
          code: newCode(code => companies.some(x => x.code === code)),
        };
        companies.push(c);
        row.hqCompanyId = c.id;
      }
    }
    users.push(row);
    return publicUser(row);
  },

  getMySites(userId: string): SiteSummary[] {
    return sites
      .filter(s => s.memberIds.includes(userId))
      .map(s => summary(s, userId));
  },

  getSite(userId: string, siteId: string): Site {
    const s = findViewableSite(userId, siteId);
    const isOwner = s.ownerId === userId;
    return clone({
      id: s.id,
      name: s.name,
      address: s.address,
      ownerId: s.ownerId,
      ownerName: ownerName(s),
      code: isOwner ? s.code : null,
      memberCount: s.memberIds.length,
      overallProgress: overallOf(s),
      progressMode: s.progressMode ?? 'manual',
      processes: processesOf(s),
      workType: s.workType ?? null,
      lastReportedAt: s.lastReportedAt ?? null,
      hqName: companies.find(c => c.id === s.companyId)?.name ?? null,
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
    });
  },

  // 총관리자: 현장 위치 저장(null이면 지우기)
  setSiteLocation(
    userId: string,
    siteId: string,
    point: { latitude: number; longitude: number } | null,
  ): Site {
    const s = findOwnedSite(userId, siteId, '현장 위치를 저장');
    s.latitude = point?.latitude ?? null;
    s.longitude = point?.longitude ?? null;
    return dummyDb.getSite(userId, siteId);
  },

  createSite(userId: string, input: CreateSiteInput): Site {
    const u = findUser(userId);
    if (u.role !== 'admin') {
      throw new ApiError(
        '현장 관리자만 현장을 만들 수 있어요. 내 정보에서 현장 관리자로 전환해 주세요.',
      );
    }
    const workType = (input.workType ?? '').trim();
    if (!workType) {
      throw new ApiError('공사 종류를 골라 주세요.');
    }
    const row: SiteRow = {
      id: `site-${Date.now()}`,
      name: input.name.trim(),
      address: input.address.trim(),
      ownerId: userId,
      code: newCode(code => sites.some(s => s.code === code)),
      companyId: u.managerCompanyId ?? null, // 보고하는 본사가 있으면 자동 연결
      memberIds: [userId],
      joinedAt: { [userId]: new Date().toISOString() },
      processes: [],
      progress: 0,
      workType: workType.slice(0, 50),
      lastReportedAt: null,
    };
    if (input.progressMode === 'auto') {
      applyMode(row, 'auto', input.processes ?? []);
    }
    sites.push(row);
    return dummyDb.getSite(userId, row.id);
  },

  // 총관리자: 진행률 계산 방식(직접 입력 / 자동 계산)과 공정·가중치
  setProgressMode(
    userId: string,
    siteId: string,
    mode: ProgressMode,
    processes: ProcessInput[],
  ): Site {
    const s = findOwnedSite(userId, siteId, '진행률 계산 방식을 바꾸');
    applyMode(s, mode, processes);
    return dummyDb.getSite(userId, siteId);
  },

  updateSite(userId: string, siteId: string, input: UpdateSiteInput): Site {
    const s = findOwnedSite(userId, siteId, '현장 정보를 수정');
    s.name = input.name.trim();
    s.address = input.address.trim();
    if (input.workType !== undefined) {
      if (!input.workType.trim()) {
        throw new ApiError('공사 종류를 골라 주세요.');
      }
      s.workType = input.workType.trim().slice(0, 50);
    }
    return dummyDb.getSite(userId, siteId);
  },

  deleteSite(userId: string, siteId: string) {
    findOwnedSite(userId, siteId, '현장을 삭제');
    sites = sites.filter(s => s.id !== siteId);
    reports = reports.filter(r => r.siteId !== siteId);
    materials = materials.filter(m => m.siteId !== siteId);
  },

  regenerateCode(userId: string, siteId: string): string {
    const s = findOwnedSite(userId, siteId, '코드를 재발급');
    if (s.code === DEMO_CODE) {
      throw new ApiError(
        '데모 현장 코드는 000000으로 고정이라 바꿀 수 없어요.',
      );
    }
    s.code = newCode(code => sites.some(x => x.code === code));
    return s.code;
  },

  previewByCode(userId: string, code: string): SitePreview {
    const s = sites.find(x => x.code === code);
    if (!s) {
      throw new ApiError(
        '해당 코드의 현장을 찾을 수 없습니다.\n코드를 다시 확인해 주세요.',
      );
    }
    return {
      id: s.id,
      name: s.name,
      address: s.address,
      ownerName: ownerName(s),
      memberCount: s.memberIds.length,
      alreadyJoined: s.memberIds.includes(userId),
    };
  },

  joinByCode(userId: string, code: string): SiteSummary {
    if (findUser(userId).role === 'hq') {
      throw new ApiError(
        '본사 관계자는 현장 총관리자가 본사 코드로 연결한 현장을 볼 수 있어요.',
      );
    }
    const s = sites.find(x => x.code === code);
    if (!s) {
      throw new ApiError('해당 코드의 현장을 찾을 수 없습니다.');
    }
    if (!s.memberIds.includes(userId)) {
      s.memberIds.push(userId);
      s.joinedAt[userId] = new Date().toISOString();
    }
    return summary(s, userId);
  },

  // 참여자 목록(관리자 먼저, 그다음 참여 순)
  getMembers(userId: string, siteId: string): Member[] {
    const s = findViewableSite(userId, siteId);
    return s.memberIds
      .map(id => {
        const u = findUser(id);
        return {
          id: u.id,
          name: u.name,
          phone: u.phone,
          role: (s.ownerId === u.id ? 'admin' : 'worker') as Role, // 이 현장에서의 역할
          isOwner: s.ownerId === u.id,
          joinedAt: s.joinedAt[u.id] ?? '',
          reportCount: reports.filter(
            r => r.siteId === s.id && r.authorId === u.id,
          ).length,
        };
      })
      .sort(
        (a, b) =>
          Number(b.isOwner) - Number(a.isOwner) ||
          a.joinedAt.localeCompare(b.joinedAt),
      );
  },

  // 총관리자: 참여자 내보내기
  removeMember(userId: string, siteId: string, memberId: string) {
    const s = findOwnedSite(userId, siteId, '참여자를 내보낼');
    if (memberId === userId) {
      throw new ApiError('본인은 내보낼 수 없습니다.');
    }
    s.memberIds = s.memberIds.filter(id => id !== memberId);
    delete s.joinedAt[memberId];
  },

  // 작업자: 현장 나가기
  leaveSite(userId: string, siteId: string) {
    const s = findMemberSite(userId, siteId);
    if (s.ownerId === userId) {
      throw new ApiError('현장 총관리자는 현장을 나갈 수 없습니다.');
    }
    s.memberIds = s.memberIds.filter(id => id !== userId);
    delete s.joinedAt[userId];
  },

  // ---- 보고 ----

  // 서버의 /sites/:id/reports/page와 같은 결과(커서 = 보고시각_보고ID)
  getReportPage(
    userId: string,
    siteId: string,
    opts: { cursor?: string | null; size?: number },
  ): ReportPage {
    const all = dummyDb.getReports(userId, siteId);
    const page = pageOf(all, opts.cursor, opts.size);
    return { ...page, total: opts.cursor ? null : all.length };
  },

  getHqReportPage(
    userId: string,
    cursor: string | null,
    size?: number,
  ): ReportPage {
    const c = findHqCompany(userId);
    const ids = sites.filter(x => x.companyId === c.id).map(x => x.id);
    const list = reports
      .filter(r => ids.includes(r.siteId))
      .sort(byNewest)
      .map(r => ({
        ...withPermissions(userId, r),
        canEdit: false,
        canDelete: false,
      }));
    return { ...pageOf(list, cursor, size), total: null };
  },

  // 현장별 확인하지 않은 보고 수(볼 수 없는 현장은 뺀다)
  getUnread(userId: string, seen: SeenInput): Record<string, number> {
    const out: Record<string, number> = {};
    Object.entries(seen).forEach(([siteId, at]) => {
      try {
        findViewableSite(userId, siteId);
      } catch {
        return;
      }
      const since = at ? Date.parse(at) : NaN;
      out[siteId] = reports.filter(
        r =>
          r.siteId === siteId &&
          (Number.isNaN(since) || Date.parse(r.createdAt) > since),
      ).length;
    });
    return out;
  },

  getReports(userId: string, siteId: string): Report[] {
    findViewableSite(userId, siteId);
    return reports
      .filter(r => r.siteId === siteId)
      .sort(byNewest)
      .map(r => withPermissions(userId, r));
  },

  addReport(userId: string, input: NewReport): Report {
    const u = findUser(userId);
    const s = findMemberSite(userId, input.siteId);
    let work = (input.work ?? '').trim();
    if (work.length > 100) {
      throw new ApiError('진행한 작업은 100자까지 쓸 수 있어요.');
    }
    const current = overallOf(s);
    const now = new Date().toISOString();
    let to: number;
    let processKey = 'work';
    let processName = work.slice(0, 30);
    let processFrom: number | null = null;
    let processTo: number | null = null;
    if (s.progressMode === 'auto') {
      // 자동 계산: 공정 하나의 진행률을 올리면 현장 전체 진행률은 가중치로 계산
      const p = s.processes.find(x => x.key === input.processKey);
      if (!p) {
        throw new ApiError('보고할 공정을 골라 주세요.');
      }
      const pTo = input.processTo ?? NaN;
      if (!Number.isFinite(pTo) || pTo < p.progress || pTo > 100) {
        throw new ApiError(
          `'${p.name}' 진행률은 지금 값(${p.progress}%) 이상, 100% 이하여야 해요.`,
        );
      }
      if (!work) {
        work = `${p.name} 작업`;
      }
      processKey = p.key;
      processName = p.name;
      processFrom = p.progress;
      processTo = Math.round(pTo * 10) / 10;
      p.progress = processTo;
      p.lastReportedAt = now;
      to = Math.max(current, legacyOverall(s.processes));
    } else {
      if (!work) {
        throw new ApiError('진행한 작업을 입력해 주세요.');
      }
      if (!Number.isFinite(input.to) || input.to < current || input.to > 100) {
        throw new ApiError(
          `진행률은 지금 진행률(${current}%) 이상, 100% 이하여야 해요.`,
        );
      }
      processName = work.slice(0, 30);
      to = Math.round(input.to * 10) / 10;
    }
    const row: ReportRow = {
      id: `r-${Date.now()}`,
      siteId: s.id,
      processKey,
      processName,
      work,
      from: current,
      to,
      processFrom,
      processTo,
      photoUris: input.photoUris,
      // 데모 모드: 서버가 없으니 폰 안의 파일 주소를 그대로 둔다
      files: input.files.map(f => ({
        name: f.name,
        url: f.uri,
        size: f.size ?? 0,
      })),
      memo: input.memo,
      workLog: input.workLog,
      author: u.name,
      authorId: u.id,
      createdAt: now,
      photos: input.photoUris.map((url, i) => ({
        url,
        takenAt: input.photoTakenAt?.[i] ?? null,
        latitude: null,
        longitude: null,
      })),
      location: input.location ?? null,
      // 본사 없는 현장의 총관리자(최고 책임자) 보고는 바로 승인
      review: {
        status: s.ownerId === u.id && !s.companyId ? 'approved' : 'pending',
        comment: null,
        reviewer: null,
        reviewedAt: null,
      },
    };
    reports.push(row);
    s.progress = row.to;
    s.lastReportedAt = now;
    return withPermissions(userId, row);
  },

  // 작성자: 메모 수정(진행률은 이후 보고와 이어져 있어 수정 불가)
  updateReportMemo(userId: string, reportId: string, memo: string): Report {
    const row = reports.find(r => r.id === reportId);
    if (!row) {
      throw new ApiError('보고를 찾을 수 없습니다.');
    }
    findMemberSite(userId, row.siteId);
    if (row.authorId !== userId) {
      throw new ApiError('작성자만 수정할 수 있습니다.');
    }
    row.memo = memo.trim();
    row.updatedAt = new Date().toISOString();
    if (row.review?.status === 'revision') {
      row.review = { ...row.review, status: 'pending' };
    }
    return withPermissions(userId, row);
  },

  // 본사·현장 총관리자: 승인 / 보완 요청(코멘트 필수)
  reviewReport(
    userId: string,
    reportId: string,
    status: 'approved' | 'revision',
    comment: string,
  ): Report {
    const row = reports.find(r => r.id === reportId);
    if (!row) {
      throw new ApiError('보고를 찾을 수 없습니다.');
    }
    findViewableSite(userId, row.siteId);
    const text = comment.trim();
    if (status === 'revision' && !text) {
      throw new ApiError('무엇을 보완해야 하는지 코멘트를 적어 주세요.');
    }
    if (text.length > 500) {
      throw new ApiError('코멘트는 500자까지 쓸 수 있어요.');
    }
    if (!withPermissions(userId, row).canReview) {
      throw new ApiError(
        row.authorId === userId
          ? '본인이 올린 보고는 검토할 수 없어요.'
          : row.review?.status !== 'pending'
          ? '이미 검토한 보고예요. 목록을 새로고침해 주세요.'
          : '현장 총관리자나 본사 관계자만 검토할 수 있어요.',
      );
    }
    row.review = {
      status,
      comment: text || null,
      reviewer: findUser(userId).name,
      reviewedAt: new Date().toISOString(),
    };
    return withPermissions(userId, row);
  },

  // 가장 최근 보고만 삭제 가능 → 현장 진행률을 보고 전 값으로 되돌린다
  deleteReport(userId: string, reportId: string) {
    const row = reports.find(r => r.id === reportId);
    if (!row) {
      throw new ApiError('보고를 찾을 수 없습니다.');
    }
    const s = findMemberSite(userId, row.siteId);
    if (!withPermissions(userId, row).canDelete) {
      throw new ApiError(
        '현장의 가장 최근 보고만, 작성자나 현장 관리자가 삭제할 수 있습니다.',
      );
    }
    reports = reports.filter(r => r.id !== reportId);
    // 자동 계산 현장은 보고한 공정의 진행률도 되돌린다
    const p =
      row.processFrom != null
        ? s.processes.find(x => x.key === row.processKey)
        : undefined;
    if (p) {
      p.progress = row.processFrom!;
      p.lastReportedAt =
        reports
          .filter(r => r.siteId === s.id && r.processKey === p.key)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
          ?.createdAt ?? null;
    }
    s.progress = row.from;
    s.lastReportedAt = latestOf(row.siteId)?.createdAt ?? null;
  },

  // ---- 자재 요청 ----

  getMaterials(userId: string, siteId: string): MaterialRequest[] {
    findViewableSite(userId, siteId);
    return materials
      .filter(m => m.siteId === siteId)
      .sort(byNewest)
      .map(m => withMaterialPermissions(userId, m));
  },

  addMaterial(userId: string, input: NewMaterialRequest): MaterialRequest {
    const u = findUser(userId);
    const s = findMemberSite(userId, input.siteId);
    const process = input.processKey
      ? s.processes.find(p => p.key === input.processKey)
      : null;
    if (input.processKey && !process) {
      throw new ApiError('존재하지 않는 공정입니다.');
    }
    const items = input.items
      .map(i => ({ ...i, name: i.name.trim(), unit: i.unit.trim() }))
      .filter(i => i.name);
    if (items.length === 0) {
      throw new ApiError('요청할 자재를 1개 이상 입력해 주세요.');
    }
    if (items.length > MAX_MATERIAL_ITEMS) {
      throw new ApiError(
        `자재는 한 번에 ${MAX_MATERIAL_ITEMS}개까지 요청할 수 있어요.`,
      );
    }
    const bad = items.find(i => !(i.quantity > 0));
    if (bad) {
      throw new ApiError(`${bad.name}의 수량을 확인해 주세요.`);
    }
    if (input.neededBy && input.neededBy < toYMD(new Date())) {
      throw new ApiError('필요일은 오늘 이후로 정해 주세요.');
    }
    // 본사에 연결되지 않은 현장의 총관리자가 직접 요청하면 바로 승인
    // (연결된 현장이면 본사가 승인·반려한다)
    const selfApproved = s.ownerId === userId && !s.companyId;
    const timeline = [event('requested', u, false)];
    if (selfApproved) {
      timeline.push(event('approved', u, false));
    }
    const row: MaterialRow = {
      id: `m-${Date.now()}`,
      siteId: s.id,
      processKey: process?.key ?? null,
      processName: process?.name ?? null,
      items,
      neededBy: input.neededBy,
      urgent: input.urgent,
      note: input.note.trim(),
      status: selfApproved ? 'approved' : 'requested',
      rejectReason: null,
      author: u.name,
      authorId: u.id,
      createdAt: new Date().toISOString(),
      timeline,
    };
    materials.push(row);
    return withMaterialPermissions(userId, row);
  },

  // 총관리자·본사: 승인 / 반려(사유)
  setMaterialStatus(
    userId: string,
    requestId: string,
    status: Exclude<MaterialStatus, 'requested'>,
    reason?: string,
  ): MaterialRequest {
    const row = findMaterial(userId, requestId);
    const u = findUser(userId);
    const s = sites.find(x => x.id === row.siteId)!;
    const owner = s.ownerId === userId;
    const hq = isHqOf(u, s);
    if (!owner && !hq) {
      throw new ApiError(
        '현장 총관리자나 본사 관계자만 자재 요청을 처리할 수 있습니다.',
      );
    }
    if (!withMaterialPermissions(userId, row).canApprove) {
      throw new ApiError(
        row.status === 'requested'
          ? '본인이 요청한 자재는 본사에서 승인해요.'
          : '이미 처리된 요청이에요. 목록을 새로고침해 주세요.',
      );
    }
    row.rejectReason =
      status === 'rejected' && reason?.trim() ? reason.trim() : null;
    row.status = status;
    row.timeline.push(event(status, u, hq && !owner));
    return withMaterialPermissions(userId, row);
  },

  // 작성자: 처리 전 요청 취소
  cancelMaterial(userId: string, requestId: string) {
    const row = findMaterial(userId, requestId);
    if (!withMaterialPermissions(userId, row).canCancel) {
      throw new ApiError('처리 전인 본인 요청만 취소할 수 있습니다.');
    }
    materials = materials.filter(m => m.id !== requestId);
  },

  // 현장 관리자로 전환·보고 체계 변경(서버 AuthService.setManager와 같은 규칙)
  setManager(userId: string, input: ManagerInput): User {
    const u = findUser(userId);
    if (u.role === 'hq') {
      throw new ApiError('본사 관계자는 현장 관리자로 바꿀 수 없어요.');
    }
    let hq: CompanyRow | null = null;
    if (input.companyCode?.trim()) {
      hq = companies.find(c => c.code === input.companyCode!.trim()) ?? null;
      if (!hq) {
        throw new ApiError(
          '해당 코드의 본사를 찾을 수 없습니다.\n코드를 다시 확인해 주세요.',
        );
      }
    }
    u.role = 'admin';
    u.managerCompanyId = hq?.id ?? null;
    if (input.company?.trim()) {
      u.company = input.company.trim();
    } else if (!u.company && hq) {
      u.company = hq.name;
    }
    if (input.linkSites) {
      sites
        .filter(s => s.ownerId === userId)
        .forEach(s => {
          s.companyId = hq?.id ?? null;
        });
    }
    return publicUser(u);
  },

  // ---- 본사 ----

  getHqInfo(userId: string): HqInfo {
    const c = findHqCompany(userId);
    return {
      name: c.name,
      code: c.code,
      siteCount: sites.filter(s => s.companyId === c.id).length,
      staff: users.filter(u => u.hqCompanyId === c.id).map(u => u.name),
    };
  },

  getHqSites(userId: string): SiteSummary[] {
    const c = findHqCompany(userId);
    return sites.filter(s => s.companyId === c.id).map(s => summary(s, userId));
  },

  getHqReports(userId: string): Report[] {
    const c = findHqCompany(userId);
    const ids = sites.filter(s => s.companyId === c.id).map(s => s.id);
    return reports
      .filter(r => ids.includes(r.siteId))
      .sort(byNewest)
      .slice(0, 100)
      .map(r => ({
        ...withPermissions(userId, r),
        canEdit: false,
        canDelete: false,
      }));
  },

  getHqMaterials(userId: string): MaterialRequest[] {
    const c = findHqCompany(userId);
    const ids = sites.filter(s => s.companyId === c.id).map(s => s.id);
    return materials
      .filter(m => ids.includes(m.siteId))
      .sort(byNewest)
      .map(m => withMaterialPermissions(userId, m));
  },

  // 총관리자: 본사 코드 확인 → 현장 연결 / 해제
  previewCompany(code: string): string {
    const c = companies.find(x => x.code === code.trim());
    if (!c) {
      throw new ApiError(
        '해당 코드의 본사를 찾을 수 없습니다.\n코드를 다시 확인해 주세요.',
      );
    }
    return c.name;
  },

  linkCompany(userId: string, siteId: string, code: string): Site {
    const s = findOwnedSite(userId, siteId, '본사를 연결');
    const c = companies.find(x => x.code === code.trim());
    if (!c) {
      throw new ApiError('해당 코드의 본사를 찾을 수 없습니다.');
    }
    s.companyId = c.id;
    return dummyDb.getSite(userId, siteId);
  },

  unlinkCompany(userId: string, siteId: string): Site {
    const s = findOwnedSite(userId, siteId, '본사 연결을 해제');
    s.companyId = null;
    return dummyDb.getSite(userId, siteId);
  },
};
