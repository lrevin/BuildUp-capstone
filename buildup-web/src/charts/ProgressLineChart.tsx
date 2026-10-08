// 현장 전체 진행률 추이: 보고마다 보고자가 입력한 현장 전체 진행률(to)을 제출 시각에 찍는다
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Report } from '../types';
import { formatDateTime, reportWork } from '../utils/format';
import { CHART, ChartTooltip, LegendKey } from './common';

export interface ProgressPoint {
  t: number; // 제출 시각(ms)
  actual: number; // 그 시점의 현장 전체 진행률
  work: string | null; // 그 보고에서 진행한 작업(시작점은 null)
  author: string | null;
}

// 시작점 = 가장 오래된 보고의 from, 이후 보고마다 to
export function buildProgressSeries(reports: Report[]): ProgressPoint[] {
  if (!reports.length) return [];
  // 같은 시각에 올라온 보고는 보고 번호 순(서버 순서와 같게)
  const asc = [...reports].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || Number(a.id) - Number(b.id),
  );
  const first = asc[0];
  const out: ProgressPoint[] = [
    { t: new Date(first.createdAt).getTime(), actual: first.from, work: null, author: null },
  ];
  for (const r of asc) {
    out.push({ t: new Date(r.createdAt).getTime(), actual: r.to, work: reportWork(r), author: r.author });
  }
  return out;
}

const shortDate = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// x축 눈금: 자정 기준 날짜를 최대 8개 정도로 고르게
const DAY = 24 * 60 * 60 * 1000;
function dayTicks(min: number, max: number) {
  const start = new Date(min);
  start.setHours(0, 0, 0, 0);
  const days = Math.max(1, Math.ceil((max - start.getTime()) / DAY));
  const step = Math.max(1, Math.ceil(days / 7));
  const out: number[] = [];
  for (let i = 0; i <= days; i += step) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    out.push(d.getTime());
  }
  return out;
}

export default function ProgressLineChart({ data }: { data: ProgressPoint[] }) {
  const values = data.map((d) => d.actual);
  const lo = Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(...values) + 5) / 10) * 10);
  const last = data[data.length - 1];
  const ticks = dayTicks(data[0].t, last.t);

  return (
    <div>
      <div className="chart-legend">
        <LegendKey kind="line" color={CHART.actual} label={`실적 (현재 ${last.actual.toFixed(1)}%)`} />
      </div>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[ticks[0], Math.max(last.t, ticks[ticks.length - 1])]}
              ticks={ticks}
              tickFormatter={shortDate}
              tick={{ fill: CHART.muted, fontSize: 12 }}
              axisLine={{ stroke: CHART.axis }}
              tickLine={false}
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
                    title={formatDateTime(new Date(p.t).toISOString())}
                    rows={[
                      { color: CHART.actual, label: p.work ? '실적' : '시작', value: `${p.actual.toFixed(1)}%` },
                      ...(p.work ? [{ label: p.work.length > 24 ? `${p.work.slice(0, 24)}…` : p.work, value: p.author ?? '' }] : []),
                    ]}
                  />
                );
              }}
            />
            <Line
              type="linear"
              dataKey="actual"
              name="실적"
              stroke={CHART.actual}
              strokeWidth={2}
              strokeLinejoin="round"
              dot={data.length <= 40 ? { r: 2.5, fill: CHART.actual, strokeWidth: 0 } : false}
              activeDot={{ r: 5, stroke: CHART.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
