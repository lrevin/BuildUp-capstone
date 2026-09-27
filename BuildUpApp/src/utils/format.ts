const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n: number) => String(n).padStart(2, '0');

// 2026.09.25 (금)
export function formatDate(d: Date = new Date()) {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} (${
    DAYS[d.getDay()]
  })`;
}

// 17:05
export function formatTime(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isToday(iso: string | null) {
  if (!iso) {
    return false;
  }
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export const pct = (v: number) => `${v.toFixed(1)}%`;
