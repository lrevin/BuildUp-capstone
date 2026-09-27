// 진척 추이 선 그래프(react-native-svg로 직접 그림)
//   x축: 날짜(ms), y축: 진행률(%)
import React, { useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme';

export interface ChartPoint {
  x: number; // 날짜(ms)
  y: number; // 진행률(%)
}

export interface ChartLine {
  points: ChartPoint[];
  color: string;
  dashed?: boolean;
  width?: number;
  dot?: boolean; // 마지막 점 표시
}

interface Props {
  lines: ChartLine[];
  xMin: number;
  xMax: number;
  today: number;
  height?: number;
}

const PAD = { left: 34, right: 12, top: 16, bottom: 28 };

const md = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// 보이는 값 범위에 맞춰 y축을 10 단위로 자동 조정
// (그래프 경계에서 잘린 끝점까지 포함해야 선이 칸 밖으로 나가지 않는다)
function yRange(lines: ChartLine[], xMin: number, xMax: number) {
  const ys = lines.flatMap(l => clip(l.points, xMin, xMax).map(p => p.y));
  if (ys.length === 0) {
    return { lo: 0, hi: 100, step: 25 };
  }
  let lo = Math.max(0, Math.floor((Math.min(...ys) - 5) / 10) * 10);
  let hi = Math.min(100, Math.ceil((Math.max(...ys) + 5) / 10) * 10);
  // 눈금이 10·20·25 단위의 딱 떨어지는 숫자가 되도록 맞춘다(최대 5칸)
  const step = [5, 10, 20, 25].find(s => (hi - lo) / s <= 5) ?? 25;
  hi = Math.min(100, lo + Math.ceil((hi - lo) / step) * step);
  lo = Math.max(0, hi - Math.max(2, Math.ceil((hi - lo) / step)) * step);
  return { lo, hi, step };
}

// 그래프 범위 밖 구간은 잘라서 경계값을 보간
function clip(points: ChartPoint[], xMin: number, xMax: number) {
  const out: ChartPoint[] = [];
  const at = (a: ChartPoint, b: ChartPoint, x: number) => ({
    x,
    y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x || 1),
  });
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];
    if (prev && prev.x < xMin && p.x > xMin) {
      out.push(at(prev, p, xMin));
    }
    if (p.x >= xMin && p.x <= xMax) {
      out.push(p);
    }
    if (prev && prev.x < xMax && p.x > xMax) {
      out.push(at(prev, p, xMax));
    }
  }
  return out;
}

export default function ProgressChart({
  lines,
  xMin,
  xMax,
  today,
  height = 220,
}: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);

  const { lo, hi, step } = yRange(lines, xMin, xMax);
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const sx = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y: number) => PAD.top + (1 - (y - lo) / (hi - lo)) * plotH;

  const ticks = Array.from(
    { length: Math.round((hi - lo) / step) + 1 },
    (_, i) => lo + step * i,
  );
  const todayX = sx(today);
  const showToday = today >= xMin && today <= xMax;

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {/* 가로 눈금선 */}
          {ticks.map(t => (
            <React.Fragment key={t}>
              <Line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={sy(t)}
                y2={sy(t)}
                stroke={colors.divider}
                strokeWidth={1}
              />
              <SvgText
                x={PAD.left - 6}
                y={sy(t) + 4}
                fontSize={10}
                fill={colors.textMuted}
                textAnchor="end"
              >
                {Math.round(t)}
              </SvgText>
            </React.Fragment>
          ))}

          {/* 오늘 */}
          {showToday ? (
            <>
              <Line
                x1={todayX}
                x2={todayX}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke={colors.yellow}
                strokeWidth={1.5}
                strokeDasharray="3,3"
              />
              <SvgText
                x={todayX}
                y={height - 8}
                fontSize={10}
                fontWeight="700"
                fill={colors.text}
                textAnchor="middle"
              >
                오늘
              </SvgText>
            </>
          ) : null}

          {/* x축 양 끝 날짜 */}
          <SvgText
            x={PAD.left}
            y={height - 8}
            fontSize={10}
            fill={colors.textMuted}
          >
            {md(xMin)}
          </SvgText>
          <SvgText
            x={width - PAD.right}
            y={height - 8}
            fontSize={10}
            fill={colors.textMuted}
            textAnchor="end"
          >
            {md(xMax)}
          </SvgText>

          {/* 선 */}
          {lines.map((l, i) => {
            const pts = clip(l.points, xMin, xMax);
            if (pts.length === 0) {
              return null;
            }
            const d = pts
              .map((p, j) => `${j === 0 ? 'M' : 'L'}${sx(p.x)},${sy(p.y)}`)
              .join(' ');
            const last = pts[pts.length - 1];
            return (
              <React.Fragment key={i}>
                <Path
                  d={d}
                  stroke={l.color}
                  strokeWidth={l.width ?? 2.5}
                  strokeDasharray={l.dashed ? '6,5' : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fill="none"
                />
                {l.dot ? (
                  <Circle
                    cx={sx(last.x)}
                    cy={sy(last.y)}
                    r={4.5}
                    fill={colors.white}
                    stroke={l.color}
                    strokeWidth={2.5}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
