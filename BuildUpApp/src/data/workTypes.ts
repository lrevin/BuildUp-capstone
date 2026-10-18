// 공사 종류 목록(현장을 만들 때 고른다. 목록에 없으면 직접 입력)
// 출처: 건설산업기본법 시행령 [별표 1] 건설업의 업종(종합공사·전문공사),
//      전기공사업법(전기공사), 정보통신공사업법(정보통신공사), 소방시설공사업법(소방시설공사)
//      + 인테리어·소규모 보수 현장에서 흔히 쓰는 공사 이름
// keywords: 검색할 때 같이 찾아 주는 말(줄임말·비슷한 말)

export interface WorkType {
  name: string;
  keywords?: string[];
}

export interface WorkTypeGroup {
  group: string;
  items: WorkType[];
}

export const WORK_TYPE_GROUPS: WorkTypeGroup[] = [
  {
    group: '인테리어·리모델링',
    items: [
      {
        name: '실내건축(인테리어) 공사',
        keywords: ['인테리어', '실내', '내장'],
      },
      {
        name: '아파트 리모델링',
        keywords: ['리모델링', '아파트', '집수리', '올수리'],
      },
      {
        name: '주택 리모델링',
        keywords: ['리모델링', '주택', '단독', '집수리'],
      },
      {
        name: '상가 인테리어',
        keywords: ['상가', '가게', '매장', '카페', '식당'],
      },
      { name: '사무실 인테리어', keywords: ['사무실', '오피스'] },
      { name: '욕실 리모델링', keywords: ['욕실', '화장실', '욕조', '변기'] },
      { name: '주방 리모델링', keywords: ['주방', '부엌', '싱크대', '싱크'] },
      { name: '도배 공사', keywords: ['도배', '벽지'] },
      {
        name: '바닥(장판·마루) 공사',
        keywords: ['바닥', '장판', '마루', '강마루', '데코타일'],
      },
      { name: '타일 공사', keywords: ['타일', '줄눈'] },
      { name: '도장(페인트) 공사', keywords: ['도장', '페인트', '칠'] },
      {
        name: '목공·가구 공사',
        keywords: ['목공', '가구', '붙박이장', '몰딩', '문'],
      },
      {
        name: '창호(샷시) 공사',
        keywords: ['창호', '샷시', '새시', '창문', '유리'],
      },
      { name: '단열 공사', keywords: ['단열', '결로', '외풍'] },
    ],
  },
  {
    group: '설비',
    items: [
      {
        name: '수도 공사(상·하수도)',
        keywords: ['수도', '상수도', '하수도', '수돗물', '배관'],
      },
      {
        name: '급배수 배관 공사',
        keywords: ['배관', '급수', '배수', '하수', '막힘'],
      },
      {
        name: '보일러·난방 공사',
        keywords: ['보일러', '난방', '온수', '바닥난방'],
      },
      {
        name: '냉난방·공조(에어컨) 공사',
        keywords: ['에어컨', '냉방', '공조', '환기', '덕트'],
      },
      { name: '가스 설비 공사', keywords: ['가스', '도시가스', 'LPG'] },
      { name: '기계설비 공사', keywords: ['기계', '설비', '펌프'] },
      {
        name: '소방시설 공사',
        keywords: ['소방', '스프링클러', '화재', '감지기'],
      },
      {
        name: '승강기 설치 공사',
        keywords: ['승강기', '엘리베이터', '리프트'],
      },
    ],
  },
  {
    group: '전기·통신',
    items: [
      { name: '전기 공사', keywords: ['전기', '분전반', '차단기'] },
      {
        name: '전기 배관·배선 공사',
        keywords: ['전기', '배관', '배선', '콘센트', '스위치', '전선'],
      },
      { name: '조명 공사', keywords: ['조명', '전등', 'LED', '등'] },
      { name: '태양광 설치 공사', keywords: ['태양광', '태양열', '발전'] },
      {
        name: '정보통신 공사(네트워크·CCTV)',
        keywords: ['통신', '네트워크', '인터넷', 'CCTV', '랜'],
      },
    ],
  },
  {
    group: '건축·토목',
    items: [
      {
        name: '건축 신축 공사',
        keywords: ['신축', '건물', '빌딩', '아파트', '오피스텔', '주택'],
      },
      { name: '증축 공사', keywords: ['증축', '증설', '확장'] },
      { name: '토목 공사', keywords: ['토목', '터파기', '옹벽', '하천'] },
      {
        name: '지반 조성·포장 공사',
        keywords: ['지반', '포장', '아스팔트', '도로', '주차장'],
      },
      {
        name: '철근·콘크리트 공사',
        keywords: ['철근', '콘크리트', '골조', '타설', '거푸집'],
      },
      {
        name: '철골(철강구조물) 공사',
        keywords: ['철골', '철강', 'H빔', '구조물'],
      },
      {
        name: '구조물 해체·비계 공사',
        keywords: ['해체', '철거', '비계', '아시바'],
      },
      {
        name: '도장·습식·방수·석공 공사',
        keywords: ['방수', '미장', '석공', '조적', '도장'],
      },
      {
        name: '금속창호·지붕 공사',
        keywords: ['지붕', '금속', '판넬', '창호'],
      },
      { name: '조경 공사', keywords: ['조경', '정원', '나무', '잔디'] },
      {
        name: '산업·환경설비(플랜트) 공사',
        keywords: ['플랜트', '공장', '산업', '환경'],
      },
      { name: '철도·궤도 공사', keywords: ['철도', '궤도', '선로'] },
      { name: '수중·준설 공사', keywords: ['수중', '준설', '항만'] },
    ],
  },
  {
    group: '보수·기타',
    items: [
      { name: '철거 공사', keywords: ['철거', '해체', '폐기물'] },
      { name: '누수 보수 공사', keywords: ['누수', '물샘', '방수', '보수'] },
      { name: '방수 공사', keywords: ['방수', '옥상', '누수'] },
      {
        name: '외벽(외장) 공사',
        keywords: ['외벽', '외장', '드라이비트', '외부'],
      },
      { name: '균열·하자 보수', keywords: ['균열', '하자', '크랙', '보수'] },
      { name: '간판 공사', keywords: ['간판', '사인'] },
      {
        name: '담장·울타리 공사',
        keywords: ['담장', '울타리', '펜스', '대문'],
      },
      { name: '준공 청소', keywords: ['청소', '준공', '입주청소'] },
    ],
  },
];

const norm = (s: string) => s.replace(/\s/g, '').toLowerCase();

/** 검색: 이름·찾기 말·분류 이름에 들어 있으면 보여 준다(띄어쓰기 무시) */
export function searchWorkTypes(query: string): WorkTypeGroup[] {
  const q = norm(query);
  if (!q) {
    return WORK_TYPE_GROUPS;
  }
  return WORK_TYPE_GROUPS.map(g => ({
    group: g.group,
    items: g.items.filter(
      it =>
        norm(it.name).includes(q) ||
        norm(g.group).includes(q) ||
        (it.keywords ?? []).some(
          k => norm(k).includes(q) || (k.length >= 2 && q.includes(norm(k))),
        ),
    ),
  })).filter(g => g.items.length > 0);
}

/** 목록에 똑같은 이름이 있는지(직접 입력 버튼을 보일지 정할 때) */
export function isListedWorkType(name: string) {
  const q = norm(name);
  return WORK_TYPE_GROUPS.some(g => g.items.some(it => norm(it.name) === q));
}

// ---- 자동 계산(공정 가중치)용 기본 공정 ----
// 현장을 만들 때 '기본 공정 넣기'를 누르면 공사 종류에 맞는 공정과 가중치(합 100%)를 채워 준다.
// 현장마다 다르므로 넣은 뒤 이름·가중치를 고쳐 쓰면 된다.
const DEFAULT_PROCESSES: Record<string, [string, number][]> = {
  '인테리어·리모델링': [
    ['철거', 10],
    ['설비·전기', 20],
    ['목공', 25],
    ['도장·도배', 20],
    ['바닥·타일', 15],
    ['마감·청소', 10],
  ],
  설비: [
    ['준비·철거', 15],
    ['배관', 45],
    ['기기 설치', 25],
    ['시험·마감', 15],
  ],
  '전기·통신': [
    ['준비', 10],
    ['배관·배선', 45],
    ['기구 설치', 30],
    ['점검·시험', 15],
  ],
  '건축·토목': [
    ['골조', 40],
    ['전기', 20],
    ['설비', 20],
    ['마감', 20],
  ],
  '보수·기타': [
    ['준비', 20],
    ['본 공사', 60],
    ['마무리', 20],
  ],
};

/** 공사 종류에 맞는 기본 공정(목록에 없는 공사는 '보수·기타' 기준) */
export function defaultProcessesFor(
  workType: string | null | undefined,
): { name: string; weight: number }[] {
  const q = norm(workType ?? '');
  const group =
    WORK_TYPE_GROUPS.find(g => g.items.some(it => norm(it.name) === q))
      ?.group ?? '보수·기타';
  return (DEFAULT_PROCESSES[group] ?? DEFAULT_PROCESSES['보수·기타']).map(
    ([name, weight]) => ({ name, weight }),
  );
}
