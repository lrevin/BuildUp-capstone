// 차트 공통 색·툴팁·범례
// 색은 dataviz 기본 팔레트 1·2번(파랑·주황)을 흰 카드 위에서 검증해 사용(validate_palette.js: 모두 통과)

export const CHART = {
  actual: '#2a78d6', // 실제 진행률
  plan: '#eb6834', // 계획 진행률
  surface: '#FFFFFF',
  grid: '#ECEEF1',
  axis: '#D5D8DE',
  muted: '#8A8F9C',
  text: '#3A3F4B',
};

export interface TooltipRow {
  color?: string;
  dashed?: boolean;
  label: string;
  value: string;
}

export function ChartTooltip({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{title}</div>
      {rows.map((r, i) => (
        <div className="chart-tooltip-row" key={i}>
          <span className="chart-tooltip-key">
            {r.color && (
              <svg width="14" height="4" aria-hidden>
                <line
                  x1="1"
                  x2="13"
                  y1="2"
                  y2="2"
                  stroke={r.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={r.dashed ? '3 3' : undefined}
                />
              </svg>
            )}
            {r.label}
          </span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

export function LegendKey({
  kind,
  color,
  label,
}: {
  kind: 'bar' | 'line' | 'dashed' | 'tick';
  color: string;
  label: string;
}) {
  return (
    <span className="legend-item">
      <svg width="18" height="12" aria-hidden>
        {kind === 'bar' && <rect x="1" y="2" width="16" height="8" rx="2" fill={color} />}
        {kind === 'line' && <line x1="1" x2="17" y1="6" y2="6" stroke={color} strokeWidth="2" strokeLinecap="round" />}
        {kind === 'dashed' && (
          <line x1="1" x2="17" y1="6" y2="6" stroke={color} strokeWidth="2" strokeDasharray="4 3" />
        )}
        {kind === 'tick' && <line x1="9" x2="9" y1="0" y2="12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />}
      </svg>
      {label}
    </span>
  );
}
