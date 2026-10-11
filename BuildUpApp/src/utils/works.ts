// 진행한 작업 태그 계산(화면과 따로 두어 테스트하기 쉽게)
export const WORK_TOTAL_MAX = 100; // 서버 Report.work 길이
export const TAG_MAX = 30;
const SEP = ', ';

/** '방수, 도배' → ['방수', '도배'] */
export function splitWorks(work: string | null | undefined): string[] {
  return (work ?? '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
}

export const joinWorks = (tags: string[]) => tags.join(SEP);

// 쉼표는 태그를 나누는 데 쓰므로 태그 안에서는 띄어쓰기로, 앞의 #은 뗀다
const clean = (t: string) =>
  t.replace(/,/g, ' ').replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, TAG_MAX);

/** 태그 목록에 하나 더 넣기. 비었거나 이미 있으면 그대로, 전체 글자 수를 넘으면 null */
export function addWork(tags: string[], text: string): string[] | null {
  const t = clean(text);
  if (!t || tags.includes(t)) {
    return tags;
  }
  const next = [...tags, t];
  return joinWorks(next).length > WORK_TOTAL_MAX ? null : next;
}
