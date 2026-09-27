// 공정별 진행률(가로 막대) + 오늘 기준 계획 진행률(세로 표시선)
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Process } from '../types';
import { plannedAt } from '../utils/plan';
import { CHART, ChartTooltip, LegendKey } from './common';

interface Row {
  name: string;
  progress: number;
  planned: number | null;
  weight: number;
}

// 계획 표시선: 막대 높이만큼 세로선
function PlanTick(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return <g />;
  return (
    <g>
      <line x1={cx} x2={cx} y1={cy - 14} y2={cy + 14} stroke={CHART.surface} strokeWidth={6} />
      <line x1={cx} x2={cx} y1={cy - 13} y2={cy + 13} stroke={CHART.plan} strokeWidth={2.5} strokeLinecap="round" />
    </g>
  );
}

export default function ProcessChart({ processes }: { processes: Process[] }) {
  const totalWeight = processes.reduce((s, p) => s + p.weight, 0) || 1;
  const data: Row[] = processes.map((p) => ({
    name: p.name,
    progress: p.progress,
    planned: plannedAt(p),
    weight: Math.round((p.weight / totalWeight) * 1000) / 10,
  }));
  const hasPlan = data.some((d) => d.planned != null);
  const height = Math.max(160, data.length * 48 + 40);

  return (
    <div>
      <div className="chart-legend">
        <LegendKey kind="bar" color={CHART.actual} label="현재 진행률" />
        {hasPlan && <LegendKey kind="tick" color={CHART.plan} label="오늘 기준 계획" />}
      </div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 4 }}>
            <CartesianGrid horizontal={false} stroke={CHART.grid} />
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: CHART.muted, fontSize: 12 }}
              axisLine={{ stroke: CHART.axis }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={64}
              tick={{ fill: CHART.text, fontSize: 13 }}
              axisLine={{ stroke: CHART.axis }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(18,23,34,0.04)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Row;
                return (
                  <ChartTooltip
                    title={`${row.name} · 비중 ${row.weight}%`}
                    rows={[
                      { color: CHART.actual, label: '현재 진행률', value: `${row.progress.toFixed(1)}%` },
                      ...(row.planned != null
                        ? [
                            { color: CHART.plan, label: '오늘 기준 계획', value: `${row.planned.toFixed(1)}%` },
                            {
                              label: '차이',
                              value: `${row.progress - row.planned >= 0 ? '+' : ''}${(row.progress - row.planned).toFixed(1)}%p`,
                            },
                          ]
                        : [{ label: '계획', value: '미설정' }]),
                    ]}
                  />
                );
              }}
            />
            <Bar
              dataKey="progress"
              fill={CHART.actual}
              barSize={18}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
              label={(props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; index?: number }) => {
                const x = Number(props.x ?? 0);
                const y = Number(props.y ?? 0);
                const w = Number(props.width ?? 0);
                const h = Number(props.height ?? 0);
                const row = data[props.index ?? 0];
                if (!row) return <g />;
                // 막대 끝과 계획 표시선 중 더 오른쪽 뒤에 값을 둔다(겹치지 않게)
                let end = x + w;
                if (row.planned != null && row.progress > 0) {
                  const full = (w * 100) / row.progress;
                  const planX = x + (full * row.planned) / 100;
                  if (planX + 4 > end && planX - end < 50) end = planX + 4;
                }
                return (
                  <text x={end + 6} y={y + h / 2} dy="0.35em" fill={CHART.text} fontSize={12} fontWeight={600}>
                    {row.progress.toFixed(1)}%
                  </text>
                );
              }}
            />
            {hasPlan && <Scatter dataKey="planned" shape={PlanTick} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
