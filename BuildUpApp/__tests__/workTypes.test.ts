// 공사 종류 검색: 비슷한 말·띄어쓰기로도 찾아지는지
import {
  defaultProcessesFor,
  isListedWorkType,
  searchWorkTypes,
} from '../src/data/workTypes';

const names = (q: string) =>
  searchWorkTypes(q).flatMap(g => g.items.map(i => i.name));

test('수도로 찾으면 수도 공사가 나온다', () => {
  expect(names('수도')).toContain('수도 공사(상·하수도)');
});

test('전기 배관 공사를 띄어 쓰거나 붙여 써도 찾는다', () => {
  expect(names('전기 배관')).toContain('전기 배관·배선 공사');
  expect(names('전기배관공사')).toContain('전기 배관·배선 공사');
});

test('비슷한 말(화장실 → 욕실, 샷시 → 창호)로도 찾는다', () => {
  expect(names('화장실')).toContain('욕실 리모델링');
  expect(names('샷시')).toContain('창호(샷시) 공사');
});

test('목록에 없는 말은 결과가 없고, 직접 입력으로 쓴다', () => {
  expect(names('우주정거장')).toEqual([]);
  expect(isListedWorkType('우주정거장 공사')).toBe(false);
  expect(isListedWorkType('도배 공사')).toBe(true);
});

test('검색어가 없으면 전체 목록', () => {
  expect(names('').length).toBeGreaterThan(40);
});

test('공사 종류별 기본 공정은 가중치 합이 100%', () => {
  for (const t of [
    '욕실 리모델링',
    '수도 공사(상·하수도)',
    '전기 배관·배선 공사',
    '우주정거장 공사',
  ]) {
    const list = defaultProcessesFor(t);
    expect(list.length).toBeGreaterThan(0);
    expect(list.reduce((a, p) => a + p.weight, 0)).toBe(100);
  }
  expect(defaultProcessesFor('욕실 리모델링').map(p => p.name)).toContain(
    '목공',
  );
});
