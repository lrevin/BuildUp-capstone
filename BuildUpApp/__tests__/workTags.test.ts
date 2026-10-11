// 진행한 작업 태그: 넣기·나누기·글자 수 제한
import { addWork, joinWorks, splitWorks } from '../src/utils/works';

test('태그를 하나씩 넣고 이어 붙인다', () => {
  let tags = addWork([], '2층 욕실 방수')!;
  tags = addWork(tags, '#거실 도배')!; // 앞의 #은 뗀다
  expect(tags).toEqual(['2층 욕실 방수', '거실 도배']);
  expect(joinWorks(tags)).toBe('2층 욕실 방수, 거실 도배');
});

test('빈 글자·같은 태그는 넣지 않는다', () => {
  expect(addWork(['방수'], '   ')).toEqual(['방수']);
  expect(addWork(['방수'], '방수')).toEqual(['방수']);
});

test('저장된 글자를 다시 태그로 나눈다(예전 보고 한 줄도 태그 하나)', () => {
  expect(splitWorks('방수, 도배')).toEqual(['방수', '도배']);
  expect(splitWorks('전기 작업')).toEqual(['전기 작업']);
  expect(splitWorks('')).toEqual([]);
});

test('모두 합쳐 100자를 넘으면 넣지 않는다', () => {
  const long = Array.from({ length: 4 }, (_, i) => `${i}`.padEnd(25, '가'));
  let tags: string[] = [];
  for (const t of long.slice(0, 3)) {
    tags = addWork(tags, t)!;
  }
  expect(addWork(tags, long[3])).toBeNull();
});
