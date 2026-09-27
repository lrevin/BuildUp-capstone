// 공정 계획 계산: 계획 진행률, 지연 여부 (모바일 앱 utils/plan.ts 와 같은 규칙)
// 계획은 '시작일에 0%, 완료일에 100%'로 매일 같은 만큼 진행한다고 본다(직선 계획).
import type { Process } from '../types';

export const TOLERANCE = 3;
const DAY = 24 * 60 * 60 * 1000;

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

export const round1 = (v: number) => Math.round(v * 10) / 10;

type PlanFields = Pick<Process, 'planStart' | 'planEnd'>;

// 특정 날짜의 계획 진행률(계획이 없으면 null)
export function plannedAt(p: PlanFields, date: Date = new Date()) {
  if (!p.planStart || !p.planEnd) return null;
  const start = parseYMD(p.planStart).getTime();
  const end = parseYMD(p.planEnd).getTime() + DAY; // 완료일 하루 끝까지
  const t = (date.getTime() - start) / (end - start);
  return round1(Math.min(1, Math.max(0, t)) * 100);
}

// 공정 비중을 반영한 전체 계획 진행률(모든 공정에 계획이 있어야 계산)
export function overallPlannedAt(
  processes: (PlanFields & Pick<Process, 'weight'>)[],
  date: Date = new Date(),
) {
  let sum = 0;
  let total = 0;
  for (const p of processes) {
    const v = plannedAt(p, date);
    if (v === null) return null;
    sum += v * p.weight;
    total += p.weight;
  }
  return total > 0 ? round1(sum / total) : null;
}

export type ScheduleStatus = 'ahead' | 'ontrack' | 'behind';

export function scheduleStatus(actual: number, planned: number) {
  const diff = round1(actual - planned);
  const status: ScheduleStatus =
    diff < -TOLERANCE ? 'behind' : diff > TOLERANCE ? 'ahead' : 'ontrack';
  return { status, diff };
}

export const STATUS_META: Record<ScheduleStatus, { label: string; color: string; bg: string }> = {
  behind: { label: '지연', color: '#D93A3F', bg: '#FDECEC' },
  ontrack: { label: '정상', color: '#6B7080', bg: '#F3F4F6' },
  ahead: { label: '앞섬', color: '#1F9D55', bg: '#E3F4EA' },
};

// "3.5%p 지연" / "계획대로" / "2.0%p 앞섬"
export function statusText(diff: number, status: ScheduleStatus) {
  if (status === 'ontrack') return '계획대로';
  return `${Math.abs(diff).toFixed(1)}%p ${STATUS_META[status].label}`;
}
