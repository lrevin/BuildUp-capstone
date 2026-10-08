// 날짜 계산 도우미('YYYY-MM-DD' 문자열, 날짜 더하기·빼기)
const DAY = 24 * 60 * 60 * 1000;

// 'YYYY-MM-DD' ↔ Date(현지 자정)
export function parseYMD(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toYMD(date: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export const daysBetween = (a: Date, b: Date) =>
  Math.round((b.getTime() - a.getTime()) / DAY);
