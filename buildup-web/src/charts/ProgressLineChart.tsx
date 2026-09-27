// 전체 진행률 추이: 보고 이력으로 날짜별 누적(공정 비중 반영) 진행률을 다시 계산
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Process, Report } from '../types';
import { dayKey, dayLabel } from '../utils/format';
import { addDays, overallPlannedAt, parseYMD, round1, toYMD } from '../utils/plan';
import { CHART, ChartTooltip, LegendKey } from './common';

export interface ProgressPoint {
  date: string; // YYYY-MM-DD
  actual: number;
  planned: number | null;
  reports: number;
}

// 공정별 시작값 = 그 공정의 가장 오래된 보고의 from (보고가 없으면 현재 진행률)
export function buildProgressSeries(processes: Process[], reports: Report[]): ProgressPoint[] {
  if (!processes.length || !reports.length) return [];
  const total = processes.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) return [];

  const asc = [...reports].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const value = new Map<string, number>();
  for (const p of processes) value.set(p.key, p.progress);
  const seen = new Set<string>();
  for (const r of asc) {
    if (!seen.has(r.processKey)) {
      seen.add(r.processKey);
      value.set(r.processKey, r.from);
    }
  }

  const byDay = new Map<string, Report[]>();
  for (const r of asc) {
    const k = dayKey(r.createdAt);
    const list = byDay.get(k) ?? [];
    list.push(r);
    byDay.set(k, list);
  }

  const overall = () => {
    let sum = 0;
    for (const p of processes) sum += (value.get(p.key) ?? 0) * p.weight;
    return round1(sum / total);
  };
  const todayKey = toYMD(new Date());
  // 지난 날짜는 그날이 끝난 시점, 오늘은 지금 시점의 계획(상단 '오늘 기준 계획'과 같은 값)
  const planAt = (ymd: string) =>
    overallPlannedAt(processes, ymd === todayKey ? new Date() : addDays(parseYMD(ymd), 1));

  const first = parseYMD(dayKey(asc[0].createdAt));
  const today = parseYMD(toYMD(new Date()));
  const out: ProgressPoint[] = [];
  const startKey = toYMD(addDays(first, -1));
  out.push({ date: startKey, actual: overall(), planned: planAt(startKey), reports: 0 });

  for (let d = first; d <= today; d = addDays(d, 1)) {
    const k = toYMD(d);
    const todays = byDay.get(k) ?? [];
    for (const r of todays) value.set(r.processKey, r.to);
    out.push({ date: k, actual: overall(), planned: planAt(k), reports: todays.length });
  }
  return out;
}

const shortDate = (ymd: string) => {
  const [, m, d] = ymd.split('-').map(Number);
  return `${m}/${d}`;
};

export default function ProgressLineChart({ data }: { data: ProgressPoint[] }) {
  const hasPlan = data.some((d) => d.planned != null);
  const values = data.flatMap((d) => (d.planned != null ? [d.actual, d.planned] : [d.actual]));
  const lo = Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(...values) + 5) / 10) * 10);
  const last = data[data.length - 1];

  return (
    <div>
      <div className="chart-legend">
        <LegendKey kind="line" color={CHART.actual} label={`실제 진행률 (현재 ${last.actual.toFixed(1)}%)`} />
        {hasPlan && (
          <LegendKey
            kind="dashed"
            color={CHART.plan}
            label={`계획 진행률${last.planned != null ? ` (오늘 ${last.planned.toFixed(1)}%)` : ''}`}
          />
        )}
      </div>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fill: CHART.muted, fontSize: 12 }}
              axisLine={{ stroke: CHART.axis }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              domain={[lo, hi]}
              ticks={Array.from({ length: Math.round((hi - lo) / 10) + 1 }, (_, i) => lo + i * 10)}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: CHART.muted, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as ProgressPoint;
                return (
                  <ChartTooltip
                    title={`${dayLabel(p.date)}${p.reports ? ` · 보고 ${p.reports}건` : ''}`}
                    rows={[
                      { color: CHART.actual, label: '실제', value: `${p.actual.toFixed(1)}%` },
                      ...(p.planned != null
                        ? [{ color: CHART.plan, dashed: true, label: '계획', value: `${p.planned.toFixed(1)}%` }]
                        : []),
                    ]}
                  />
                );
              }}
            />
            {hasPlan && (
              <Line
                type="linear"
                dataKey="planned"
                stroke={CHART.plan}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 4, stroke: CHART.surface, strokeWidth: 2 }}
                isAnimationActive={false}
                connectNulls
              />
            )}
            <Line
              type="linear"
              dataKey="actual"
              stroke={CHART.actual}
              strokeWidth={2}
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 5, stroke: CHART.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
