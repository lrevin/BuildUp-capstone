// 폰 저장소: 로그인 유지, 더미 DB 저장, 보고 작성 임시저장, 본사의 보고 확인 시각
import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { PickedFile, User, WorkLog } from '../types';
import { DummyState, dummyState } from './dummy';

const store = createAsyncStorage('buildup');

const KEYS = {
  server: 'server-config', // { useDummy, baseUrl }
  session: 'session', // { userId, token }
  dummyDb: 'dummy-db-v8', // 데이터 모양이 바뀌면 버전을 올려 예전 저장본을 무시
  draft: (userId: string, siteId: string) => `draft:${userId}:${siteId}-v2`,
  seen: (userId: string) => `seen-reports:${userId}`, // { 현장 id: 마지막으로 본 시각 }
};

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // 저장된 값이 깨졌으면 없는 것으로 본다
  }
}

const writeJson = (key: string, value: unknown) =>
  store.setItem(key, JSON.stringify(value)).catch(() => {});

// ---- 서버 연결 설정 ----

export interface ServerConfig {
  useDummy: boolean;
  baseUrl: string;
}

export const serverConfigStore = {
  load: () => readJson<ServerConfig>(KEYS.server),
  save: (c: ServerConfig) => writeJson(KEYS.server, c),
};

// ---- 로그인 유지 ----

export interface SavedSession {
  userId: string;
  token: string | null;
  user?: User; // 서버에 연결되지 않을 때 이 정보로 시작
}

export const sessionStore = {
  load: () => readJson<SavedSession>(KEYS.session),
  save: (s: SavedSession) => writeJson(KEYS.session, s),
  clear: () => store.removeItem(KEYS.session).catch(() => {}),
};

// ---- 더미 DB(서버 연동 전까지만 사용) ----

export const dummyStore = {
  async load() {
    const saved = await readJson<DummyState>(KEYS.dummyDb);
    if (saved) {
      dummyState.import(saved);
    }
  },
  save: () => writeJson(KEYS.dummyDb, dummyState.export()),
  async reset() {
    dummyState.reset();
    await store.removeItem(KEYS.dummyDb).catch(() => {});
  },
};

// ---- 보고 작성 임시저장 ----

export interface ReportDraft {
  work: string; // 진행한 작업
  value: number; // 입력 중인 현장 전체 진행률
  memo: string;
  photoUris: string[];
  files?: PickedFile[];
  workLog?: WorkLog;
  savedAt: string;
}

export const draftStore = {
  load: (userId: string, siteId: string) =>
    readJson<ReportDraft>(KEYS.draft(userId, siteId)),
  save: (userId: string, siteId: string, d: ReportDraft) =>
    writeJson(KEYS.draft(userId, siteId), d),
  clear: (userId: string, siteId: string) =>
    store.removeItem(KEYS.draft(userId, siteId)).catch(() => {}),
};

// ---- 본사 관계자: 현장별로 보고를 마지막으로 확인한 시각(안 읽은 보고 표시용) ----

export type SeenMap = Record<string, string>; // 현장 id → ISO 시각

export const seenStore = {
  load: async (userId: string): Promise<SeenMap> =>
    (await readJson<SeenMap>(KEYS.seen(userId))) ?? {},
  async markSeen(userId: string, siteIds: string[]) {
    const map = await seenStore.load(userId);
    const now = new Date().toISOString();
    siteIds.forEach(id => {
      map[id] = now;
    });
    await writeJson(KEYS.seen(userId), map);
  },
};

// 확인하지 않은 보고 수(한 번도 안 봤으면 모든 보고)
export const unreadCount = (
  reports: { siteId: string; createdAt: string }[],
  siteId: string,
  seen: SeenMap,
) =>
  reports.filter(
    r =>
      r.siteId === siteId &&
      (!seen[siteId] || Date.parse(r.createdAt) > Date.parse(seen[siteId])),
  ).length;
